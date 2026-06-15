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
import {
  defaultCenterline,
  lineFromWaypoints,
  waypointsFromLine,
} from "@/lib/distances/centerline";
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

/** Lo que el modo está editando: línea azul (hoyo), amarilla (fairway) o
 *  naranja (centro de fairway, una línea abierta salida→green). */
type RingKind = "boundary" | "fairway" | "centerline";

/** Mínimo de puntos: polígonos cerrados ≥3, la línea de centro ≥2. */
function minPoints(kind: RingKind): number {
  return kind === "centerline" ? 2 : 3;
}

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
  const [centerlineRing, setCenterlineRing] = useState<LatLon[]>([]);
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
      const [gRes, bRes, fRes, cRes] = await Promise.all([
        fetch(
          `/api/captura/distancias/greens?hole=${hole}&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/distancias/boundary?hole=${hole}&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=fairway&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=centerline&course_id=${CCQ_COURSE_ID}`
        ),
      ]);
      const gData = await gRes.json();
      const bData = await bRes.json();
      const fData = await fRes.json();
      const cData = await cRes.json();

      // Centro y "atrás" del green (para generar la línea de centro por defecto).
      let greenCenter: LatLon | null = null;
      let greenBack: LatLon | null = null;
      if (gData?.ok) {
        greenCenter = gData.center;
        greenBack = gData.back ?? null;
        setGreen({
          front: gData.front,
          center: gData.center,
          back: gData.back,
          saved: gData.saved ?? { front: false, center: false, back: false },
        });
      } else {
        const hp = CCQ_HOLE_POINTS[hole];
        if (hp) {
          greenCenter = hp.center;
          greenBack = hp.back ?? null;
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

      // Centro de fairway: lo calibrado, o uno por defecto (recta salida→green
      // según par) que el usuario solo acomoda. NO se guarda hasta que lo mueva.
      let centerWps: LatLon[] = [];
      if (cData?.ok && Array.isArray(cData.polygons)) {
        const cl = cData.polygons.find(
          (p: { kind: string }) => p.kind === "centerline"
        );
        centerWps = cl ? waypointsFromLine(cl.geojson) : [];
      }
      if (centerWps.length < 2) {
        const hp = CCQ_HOLE_POINTS[hole];
        if (hp?.tee && greenCenter) {
          centerWps = defaultCenterline(
            hp.tee,
            greenCenter,
            greenBack,
            hp.par ?? 4
          );
        }
      }
      setCenterlineRing(centerWps);
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

  // Contorno/línea activos según el modo.
  const activeKind: RingKind | null =
    mode === "boundary"
      ? "boundary"
      : mode === "fairway"
        ? "fairway"
        : mode === "centerline"
          ? "centerline"
          : null;
  const activeRing =
    activeKind === "fairway"
      ? fairwayRing
      : activeKind === "centerline"
        ? centerlineRing
        : boundaryRing;
  const setActiveRing =
    activeKind === "fairway"
      ? setFairwayRing
      : activeKind === "centerline"
        ? setCenterlineRing
        : setBoundaryRing;

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

  /** Guarda lo dibujado en su endpoint: boundary=azul, fairway=amarillo (polígono),
   *  centerline=naranja (línea abierta salida→green). */
  const persistRing = async (kind: RingKind, ring: LatLon[], note: string) => {
    setBusy(true);
    try {
      // Línea/fairway vacíos: borrar el registro (no se puede guardar vacío).
      if (kind !== "boundary" && ring.length === 0) {
        const res = await fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=${kind}&course_id=${CCQ_COURSE_ID}&tg=${encodeURIComponent(tgId)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error");
        flash("ok", note);
        return;
      }
      const geo =
        kind === "centerline"
          ? lineFromWaypoints(ring)
          : polygonFromRing(hole, ring).geometry;
      const url =
        kind === "boundary"
          ? "/api/captura/calibrar/boundary"
          : "/api/captura/calibrar/polygon";
      const body =
        kind === "boundary"
          ? { tg: tgId, course_id: CCQ_COURSE_ID, hole, polygon: geo }
          : { tg: tgId, course_id: CCQ_COURSE_ID, hole, kind, polygon: geo };
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      flash("ok", note);
    } catch (e) {
      // No recargamos del servidor para NO perder el trazo en curso; el usuario
      // puede reintentar moviendo/agregando un punto.
      flash("err", e instanceof Error ? e.message : "Error al guardar línea");
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

  /** Agrega un punto al final del contorno/línea (para ir trazando uno nuevo). */
  const appendPoint = async (lat: number, lon: number) => {
    if (!activeKind) return;
    const next = [...activeRing, { lat, lon }];
    setActiveRing(next);
    setSelectedVertex(next.length - 1);
    if (next.length >= minPoints(activeKind)) {
      await persistRing(activeKind, next, `Punto ${next.length} agregado.`);
    }
  };

  const deleteVertex = async () => {
    if (!activeKind) return;
    const min = minPoints(activeKind);
    if (activeRing.length <= min) {
      // Fairway/centro: borrar todo deja la línea sin dibujar.
      if (activeKind !== "boundary" && activeRing.length > 0) {
        setActiveRing([]);
        setSelectedVertex(0);
        await persistRing(
          activeKind,
          [],
          activeKind === "fairway" ? "Fairway borrado." : "Centro borrado."
        );
        return;
      }
      flash("err", `Mínimo ${min} puntos.`);
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
    // Modo agregar: cada toque agrega el siguiente punto del contorno en orden.
    void appendPoint(lat, lon);
  };

  const switchMode = (next: SimpleCalibrarMode) => {
    setMode(next);
    setSelectedVertex(0);
    // En fairway sin contorno, arranca en "agregar tocando" para trazarlo.
    // El centro de fairway ya viene pre-cargado, así que NO arranca agregando.
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

  const isRingMode =
    mode === "boundary" || mode === "fairway" || mode === "centerline";
  const ringLabel =
    mode === "fairway"
      ? "fairway"
      : mode === "centerline"
        ? "centro de fairway"
        : "hoyo";

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
            centerlineRing={centerlineRing}
            addingCorner={addingCorner}
            selectedGreen={selectedGreen}
            selectedVertex={selectedVertex}
            onGreenMove={saveGreen}
            onVertexMove={saveVertex}
            onVertexSelect={setSelectedVertex}
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
              "flex-1 rounded-lg py-2.5 text-[11px] font-bold",
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
              "flex-1 rounded-lg py-2.5 text-[11px] font-bold",
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
              "flex-1 rounded-lg py-2.5 text-[11px] font-bold",
              mode === "fairway"
                ? "bg-yellow-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Fairway
          </button>
          <button
            type="button"
            onClick={() => switchMode("centerline")}
            className={[
              "flex-1 rounded-lg py-2.5 text-[11px] font-bold",
              mode === "centerline"
                ? "bg-orange-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Centro
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
                          : mode === "centerline"
                            ? "border-orange-300 bg-orange-400 text-black"
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
                {activeKind &&
                activeRing.length <= minPoints(activeKind) &&
                mode === "fairway"
                  ? "Borrar fairway"
                  : activeKind &&
                      activeRing.length <= minPoints(activeKind) &&
                      mode === "centerline"
                    ? "Borrar centro"
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
