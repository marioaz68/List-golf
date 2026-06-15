"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import {
  defaultHoleRing,
  parseBoundaryGeoJson,
  polygonFromRing,
  ringFromPolygon,
  type LatLon,
} from "@/lib/distances/holeBoundary";
import type {
  SimpleCalibrarMode,
  SimpleGreenKey,
} from "@/components/captura/SimpleCalibrarMap";

const SimpleCalibrarMap = dynamic(
  () =>
    import("@/components/captura/SimpleCalibrarMap").then(
      (m) => m.SimpleCalibrarMap
    ),
  {
    ssr: false,
    loading: () => (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-900 text-sm text-slate-400">
        Cargando mapa…
      </div>
    ),
  }
);

interface GreenInfo {
  front: LatLon;
  center: LatLon;
  back: LatLon;
  saved: { front: boolean; center: boolean; back: boolean };
}

const GREEN_META: Record<
  SimpleGreenKey,
  { label: string; color: string }
> = {
  front: { label: "Entrada", color: "#34d399" },
  center: { label: "Centro", color: "#10b981" },
  back: { label: "Atrás", color: "#059669" },
};

/** Contorno que el modo está editando (línea azul del hoyo o amarilla fairway). */
type RingKind = "boundary" | "fairway";

export default function CalibrarClient({ tg }: { tg: string }) {
  const searchParams = useSearchParams();
  const tgId = tg || searchParams.get("tg") || "";

  const [hole, setHole] = useState(1);
  const [mode, setMode] = useState<SimpleCalibrarMode>("green");
  const [selectedGreen, setSelectedGreen] = useState<SimpleGreenKey>("front");
  const [selectedVertex, setSelectedVertex] = useState(0);
  // Modo "agregar tocando": cada toque agrega un punto al contorno activo.
  const [addingCorner, setAddingCorner] = useState(false);
  const [green, setGreen] = useState<GreenInfo | null>(null);
  const [boundaryRing, setBoundaryRing] = useState<LatLon[]>(() =>
    defaultHoleRing(1)
  );
  const [fairwayRing, setFairwayRing] = useState<LatLon[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 2200);
  };

  const refetch = useCallback(async () => {
    try {
      const [gRes, bRes, fRes] = await Promise.all([
        fetch(
          `/api/captura/distancias/greens?hole=${hole}&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/distancias/boundary?hole=${hole}&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=fairway&course_id=${CCQ_COURSE_ID}`
        ),
      ]);
      const gData = await gRes.json();
      const bData = await bRes.json();
      const fData = await fRes.json();

      if (gData?.ok) {
        setGreen({
          front: gData.front,
          center: gData.center,
          back: gData.back,
          saved: gData.saved ?? { front: false, center: false, back: false },
        });
      } else {
        const hp = CCQ_HOLE_POINTS[hole];
        if (hp) {
          setGreen({
            front: hp.front,
            center: hp.center,
            back: hp.back,
            saved: { front: false, center: false, back: false },
          });
        }
      }

      if (bData?.ok) {
        const poly = parseBoundaryGeoJson(bData.polygon);
        setBoundaryRing(poly ? ringFromPolygon(poly) : defaultHoleRing(hole));
      } else {
        setBoundaryRing(defaultHoleRing(hole));
      }

      if (fData?.ok && Array.isArray(fData.polygons)) {
        const fw = fData.polygons.find(
          (p: { kind: string }) => p.kind === "fairway"
        );
        const poly = fw ? parseBoundaryGeoJson(fw.geojson) : null;
        setFairwayRing(poly ? ringFromPolygon(poly) : []);
      } else {
        setFairwayRing([]);
      }
    } catch {
      flash("err", "No se pudo cargar el hoyo.");
    }
  }, [hole]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const greenPoints = useMemo(() => {
    if (!green) return [];
    return (["front", "center", "back"] as SimpleGreenKey[]).map((key) => ({
      key,
      lat: green[key].lat,
      lon: green[key].lon,
      label: GREEN_META[key].label,
      color: GREEN_META[key].color,
    }));
  }, [green]);

  // Contorno activo según el modo (azul hoyo / amarillo fairway).
  const activeKind: RingKind | null =
    mode === "boundary" ? "boundary" : mode === "fairway" ? "fairway" : null;
  const activeRing = activeKind === "fairway" ? fairwayRing : boundaryRing;
  const setActiveRing =
    activeKind === "fairway" ? setFairwayRing : setBoundaryRing;

  const saveGreen = async (key: SimpleGreenKey, lat: number, lon: number) => {
    setGreen((prev) =>
      prev
        ? {
            ...prev,
            [key]: { lat, lon },
            saved: { ...prev.saved, [key]: true },
          }
        : prev
    );
    setBusy(true);
    try {
      const res = await fetch("/api/captura/calibrar/green", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg: tgId,
          course_id: CCQ_COURSE_ID,
          hole,
          key,
          lat,
          lon,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      flash("ok", `${GREEN_META[key].label} guardado.`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar");
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  /** Guarda el contorno (azul=boundary, amarillo=fairway) en su endpoint. */
  const persistRing = async (kind: RingKind, ring: LatLon[], note: string) => {
    setBusy(true);
    try {
      const polygon = polygonFromRing(hole, ring).geometry;
      const url =
        kind === "boundary"
          ? "/api/captura/calibrar/boundary"
          : "/api/captura/calibrar/polygon";
      const body =
        kind === "boundary"
          ? { tg: tgId, course_id: CCQ_COURSE_ID, hole, polygon }
          : { tg: tgId, course_id: CCQ_COURSE_ID, hole, kind: "fairway", polygon };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      flash("ok", note);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar línea");
      await refetch();
    } finally {
      setBusy(false);
    }
  };

  const saveVertex = async (index: number, lat: number, lon: number) => {
    if (!activeKind) return;
    const next = activeRing.map((v, i) => (i === index ? { lat, lon } : v));
    setActiveRing(next);
    await persistRing(activeKind, next, `Punto ${index + 1} guardado.`);
  };

  /** Agrega un punto al final del contorno (para ir trazando uno nuevo). */
  const appendPoint = async (lat: number, lon: number) => {
    if (!activeKind) return;
    const next = [...activeRing, { lat, lon }];
    setActiveRing(next);
    setSelectedVertex(next.length - 1);
    if (next.length >= 3) {
      await persistRing(activeKind, next, `Punto ${next.length} agregado.`);
    }
  };

  // Inserta un punto donde tocaste, en el lado (segmento) más cercano del
  // contorno. Así el nuevo punto queda "en orden" y la línea no se cruza.
  const insertAtNearestEdge = async (lat: number, lon: number) => {
    if (!activeKind) return;
    const ring = activeRing;
    if (ring.length < 3) {
      await appendPoint(lat, lon);
      return;
    }
    const mLon = 111_320 * Math.cos((lat * Math.PI) / 180);
    const mLat = 110_574;
    const px = lon * mLon;
    const py = lat * mLat;
    let bestEdge = 0;
    let bestD = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i];
      const b = ring[(i + 1) % ring.length];
      const ax = a.lon * mLon;
      const ay = a.lat * mLat;
      const bx = b.lon * mLon;
      const by = b.lat * mLat;
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const cx = ax + t * dx;
      const cy = ay + t * dy;
      const d = Math.hypot(px - cx, py - cy);
      if (d < bestD) {
        bestD = d;
        bestEdge = i;
      }
    }
    const next = [
      ...ring.slice(0, bestEdge + 1),
      { lat, lon },
      ...ring.slice(bestEdge + 1),
    ];
    setActiveRing(next);
    setSelectedVertex(bestEdge + 1);
    await persistRing(activeKind, next, `Punto ${bestEdge + 2} agregado.`);
  };

  const deleteVertex = async () => {
    if (!activeKind) return;
    if (activeRing.length <= 3) {
      // En fairway, borrar todo deja la línea sin dibujar.
      if (activeKind === "fairway" && activeRing.length > 0) {
        setActiveRing([]);
        setSelectedVertex(0);
        await persistRing("fairway", [], "Fairway borrado.");
        return;
      }
      flash("err", "Mínimo 3 puntos.");
      return;
    }
    const i = selectedVertex;
    const next = activeRing.filter((_, idx) => idx !== i);
    setActiveRing(next);
    setSelectedVertex(Math.max(0, i - 1));
    await persistRing(activeKind, next, "Punto borrado.");
  };

  const handleMapTap = (lat: number, lon: number) => {
    if (mode === "green") {
      void saveGreen(selectedGreen, lat, lon);
      return;
    }
    if (!activeKind || !addingCorner) {
      // Sin "agregar tocando": para mover un punto, arrástralo directamente.
      return;
    }
    if (activeRing.length < 3) {
      void appendPoint(lat, lon);
    } else {
      void insertAtNearestEdge(lat, lon);
    }
  };

  const switchMode = (next: SimpleCalibrarMode) => {
    setMode(next);
    setSelectedVertex(0);
    // En fairway sin contorno, arranca en "agregar tocando" para trazarlo.
    if (next === "fairway") setAddingCorner(fairwayRing.length < 3);
    else setAddingCorner(false);
  };

  const changeHole = (delta: number) => {
    setAddingCorner(false);
    setSelectedVertex(0);
    setHole((h) => {
      let n = h + delta;
      if (n < 1) n = 18;
      if (n > 18) n = 1;
      return n;
    });
  };

  const isRingMode = mode === "boundary" || mode === "fairway";
  const ringLabel = mode === "fairway" ? "fairway" : "hoyo";

  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-black text-white">
      {/* Mapa: ocupa casi toda la pantalla */}
      <div className="relative min-h-0 flex-1">
        {green ? (
          <SimpleCalibrarMap
            holeNo={hole}
            mode={mode}
            greenPoints={greenPoints}
            boundaryRing={boundaryRing}
            fairwayRing={fairwayRing}
            selectedGreen={selectedGreen}
            selectedVertex={selectedVertex}
            onGreenMove={saveGreen}
            onVertexMove={saveVertex}
            onMapTap={handleMapTap}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Cargando hoyo {hole}…
          </div>
        )}

        {/* Hoyo + cerrar */}
        <div className="absolute left-2 top-2 z-[1000] flex items-center gap-1">
          <button
            type="button"
            onClick={() => changeHole(-1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-xl font-bold"
          >
            ‹
          </button>
          <div className="rounded-lg bg-black/70 px-3 py-1.5 text-center">
            <div className="text-base font-black">Hoyo {hole}</div>
          </div>
          <button
            type="button"
            onClick={() => changeHole(1)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-xl font-bold"
          >
            ›
          </button>
        </div>

        <Link
          href="/"
          aria-label="Cerrar"
          className="absolute right-2 top-2 z-[1000] flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-lg font-bold"
        >
          ✕
        </Link>

        {msg ? (
          <div
            className={[
              "absolute left-1/2 top-14 z-[1000] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-bold shadow-lg",
              msg.kind === "ok" ? "bg-emerald-600" : "bg-red-600",
            ].join(" ")}
          >
            {msg.text}
          </div>
        ) : null}

        {busy ? (
          <div className="pointer-events-none absolute right-2 top-14 z-[1000] rounded-full bg-black/70 px-2 py-1 text-[10px] text-slate-300">
            Guardando…
          </div>
        ) : null}
      </div>

      {/* Barra inferior fija y pequeña */}
      <div className="z-[1000] shrink-0 border-t border-slate-700 bg-slate-950 px-2 pb-[max(8px,env(safe-area-inset-bottom))] pt-2">
        <div className="mb-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => switchMode("green")}
            className={[
              "flex-1 rounded-lg py-2.5 text-xs font-bold",
              mode === "green"
                ? "bg-emerald-500 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Green
          </button>
          <button
            type="button"
            onClick={() => switchMode("boundary")}
            className={[
              "flex-1 rounded-lg py-2.5 text-xs font-bold",
              mode === "boundary"
                ? "bg-cyan-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Línea hoyo
          </button>
          <button
            type="button"
            onClick={() => switchMode("fairway")}
            className={[
              "flex-1 rounded-lg py-2.5 text-xs font-bold",
              mode === "fairway"
                ? "bg-yellow-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Fairway
          </button>
        </div>

        {mode === "green" ? (
          <div className="flex gap-1.5">
            {(["front", "center", "back"] as SimpleGreenKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedGreen(key)}
                className={[
                  "flex-1 rounded-lg border py-2 text-[11px] font-bold",
                  selectedGreen === key
                    ? "border-amber-400 bg-amber-500 text-black"
                    : "border-slate-600 bg-slate-800 text-white",
                ].join(" ")}
              >
                {GREEN_META[key].label}
                {green?.saved[key] ? " ✓" : ""}
              </button>
            ))}
          </div>
        ) : isRingMode ? (
          <>
            {activeRing.length > 0 ? (
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {activeRing.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedVertex(i)}
                    className={[
                      "shrink-0 rounded-lg border px-3 py-2 text-[11px] font-bold",
                      selectedVertex === i
                        ? mode === "fairway"
                          ? "border-yellow-300 bg-yellow-400 text-black"
                          : "border-cyan-300 bg-cyan-400 text-black"
                        : "border-slate-600 bg-slate-800 text-white",
                    ].join(" ")}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-slate-800 px-3 py-2 text-center text-[11px] text-slate-300">
                Aún no hay {ringLabel}. Activa «+ Agregar tocando» y toca el mapa.
              </div>
            )}
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setAddingCorner((a) => !a)}
                className={[
                  "flex-1 rounded-lg py-2 text-[11px] font-bold disabled:opacity-50",
                  addingCorner
                    ? "bg-amber-500 text-black"
                    : "bg-emerald-600 text-white",
                ].join(" ")}
              >
                {addingCorner ? "✓ Tocando: agregar" : "+ Agregar tocando"}
              </button>
              <button
                type="button"
                disabled={busy || activeRing.length === 0}
                onClick={() => void deleteVertex()}
                className="flex-1 rounded-lg border border-red-600/60 bg-red-900/40 py-2 text-[11px] font-bold text-red-200 disabled:opacity-40"
              >
                {activeRing.length <= 3 && mode === "fairway"
                  ? "Borrar fairway"
                  : `Borrar punto ${selectedVertex + 1}`}
              </button>
            </div>
          </>
        ) : null}

        <p className="mt-2 text-center text-[11px] leading-snug text-slate-400">
          {mode === "green"
            ? "Arrastra el punto verde o toca el mapa donde va en la foto."
            : addingCorner
              ? `Toca el mapa para ir agregando el contorno del ${ringLabel} en orden. Vuelve a tocar el botón para terminar.`
              : `Arrastra un punto del ${ringLabel}, o usa «+ Agregar tocando» para crear nuevos.`}
        </p>
      </div>
    </div>
  );
}
