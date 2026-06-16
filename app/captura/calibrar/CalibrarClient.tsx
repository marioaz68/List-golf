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
import { haversineMeters } from "@/lib/distances/ccqGreens";
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

/** Lo que el modo está editando: línea azul (hoyo), amarilla (fairway),
 *  naranja (centro de fairway, línea abierta) o polígonos múltiples por hoyo
 *  (bunkers = arena, lagos = agua, green = área del green). */
type RingKind =
  | "boundary"
  | "fairway"
  | "centerline"
  | "bunker"
  | "water"
  | "green"
  | "ob";

/** Modos con varios polígonos por hoyo (se crean/editan/borran uno por uno). */
type MultiKind = "bunker" | "water" | "green" | "ob";

const MULTI_META: Record<
  MultiKind,
  { label: string; one: string; prefix: string }
> = {
  bunker: { label: "Bunkers", one: "bunker", prefix: "B" },
  water: { label: "Lagos", one: "lago", prefix: "L" },
  green: { label: "Greens", one: "green", prefix: "G" },
  ob: { label: "OB", one: "OB", prefix: "OB" },
};

/** El OB es de TODO el campo (fraccionamiento): se guarda y carga con
 *  hole_number = 0 y se muestra en todos los hoyos. El resto van por hoyo. */
const COURSE_WIDE_HOLE = 0;
function holeForKind(kind: RingKind, hole: number): number {
  return kind === "ob" ? COURSE_WIDE_HOLE : hole;
}

/** Modo de la UI → tipo de polígono múltiple (el área del green usa el modo
 *  "greenarea" para no chocar con "green", que son los puntos del green). */
function modeToMulti(m: SimpleCalibrarMode): MultiKind | null {
  if (m === "bunker") return "bunker";
  if (m === "water") return "water";
  if (m === "greenarea") return "green";
  if (m === "ob") return "ob";
  return null;
}

/** Mínimo de puntos: polígonos cerrados ≥3; centerline y OB = líneas abiertas ≥2. */
function minPoints(kind: RingKind): number {
  return kind === "centerline" || kind === "ob" ? 2 : 3;
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
  // Bunkers, lagos y áreas de green: varios polígonos por hoyo.
  // El índice del arreglo = sort_order.
  const [bunkers, setBunkers] = useState<LatLon[][]>([]);
  const [waters, setWaters] = useState<LatLon[][]>([]);
  const [greenAreas, setGreenAreas] = useState<LatLon[][]>([]);
  // OB de todo el campo (compartido por todos los hoyos, hole_number = 0).
  const [obAreas, setObAreas] = useState<LatLon[][]>([]);
  // Índice del polígono activo dentro del modo múltiple actual.
  const [activePoly, setActivePoly] = useState<number | null>(null);
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
      const [gRes, bRes, fRes, cRes, bkRes, wRes, grRes, obRes] =
        await Promise.all([
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
        fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=bunker&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=water&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/calibrar/polygon?hole=${hole}&kind=green&course_id=${CCQ_COURSE_ID}`
        ),
        // OB: de todo el campo (hole 0), no del hoyo actual.
        fetch(
          `/api/captura/calibrar/polygon?hole=${COURSE_WIDE_HOLE}&kind=ob&course_id=${CCQ_COURSE_ID}`
        ),
      ]);
      const gData = await gRes.json();
      const bData = await bRes.json();
      const fData = await fRes.json();
      const cData = await cRes.json();
      const bkData = await bkRes.json();
      const wData = await wRes.json();
      const grData = await grRes.json();
      const obData = await obRes.json();

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

      // Bunkers/lagos/green = polígonos; OB = líneas abiertas (LineString).
      const ringsFrom = (data: unknown, kind: MultiKind): LatLon[][] => {
        const d = data as { ok?: boolean; polygons?: unknown };
        if (!d?.ok || !Array.isArray(d.polygons)) return [];
        return (d.polygons as { kind: string; sort_order?: number; geojson: unknown }[])
          .filter((p) => p.kind === kind)
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p) => {
            const poly = parseBoundaryGeoJson(p.geojson);
            return poly ? ringFromPolygon(poly) : [];
          })
          .filter((r) => r.length >= 3);
      };
      const obLinesFrom = (data: unknown): LatLon[][] => {
        const d = data as { ok?: boolean; polygons?: unknown };
        if (!d?.ok || !Array.isArray(d.polygons)) return [];
        return (d.polygons as { kind: string; sort_order?: number; geojson: unknown }[])
          .filter((p) => p.kind === "ob")
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((p) => {
            const wps = waypointsFromLine(p.geojson);
            if (wps.length >= 2) return wps;
            // Compat: OB guardado antes como polígono.
            const poly = parseBoundaryGeoJson(p.geojson);
            return poly ? ringFromPolygon(poly) : [];
          })
          .filter((r) => r.length >= 2);
      };
      setBunkers(ringsFrom(bkData, "bunker"));
      setWaters(ringsFrom(wData, "water"));
      setGreenAreas(ringsFrom(grData, "green"));
      setObAreas(obLinesFrom(obData));
      setActivePoly(null);
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

  // Modo múltiple (bunkers, lagos o áreas de green): lista y setter.
  const multiKind: MultiKind | null = modeToMulti(mode);
  const multiList =
    multiKind === "water"
      ? waters
      : multiKind === "green"
        ? greenAreas
        : multiKind === "ob"
          ? obAreas
          : bunkers;
  const setMultiList =
    multiKind === "water"
      ? setWaters
      : multiKind === "green"
        ? setGreenAreas
        : multiKind === "ob"
          ? setObAreas
          : setBunkers;

  // Contorno/línea activos según el modo.
  const activeKind: RingKind | null =
    mode === "boundary"
      ? "boundary"
      : mode === "fairway"
        ? "fairway"
        : mode === "centerline"
          ? "centerline"
          : multiKind;
  const activeRing: LatLon[] =
    activeKind === "fairway"
      ? fairwayRing
      : activeKind === "centerline"
        ? centerlineRing
        : multiKind
          ? activePoly != null
            ? (multiList[activePoly] ?? [])
            : []
          : boundaryRing;
  const setActiveRing = (next: LatLon[]) => {
    if (activeKind === "fairway") setFairwayRing(next);
    else if (activeKind === "centerline") setCenterlineRing(next);
    else if (multiKind) {
      if (activePoly != null) {
        setMultiList((prev) =>
          prev.map((r, i) => (i === activePoly ? next : r))
        );
      }
    } else setBoundaryRing(next);
  };
  /** sort_order del slot que se está editando (bunker/lago = su índice). */
  const activeSortOrder = multiKind ? (activePoly ?? 0) : 0;

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
   *  centerline=naranja (línea abierta), bunker=arena (sortOrder = slot). */
  const persistRing = async (
    kind: RingKind,
    ring: LatLon[],
    note: string,
    sortOrder = 0
  ) => {
    const polyHole = holeForKind(kind, hole);
    setBusy(true);
    try {
      // Línea/fairway/bunker vacíos: borrar ese slot (no se guarda vacío).
      if (kind !== "boundary" && ring.length === 0) {
        const res = await fetch(
          `/api/captura/calibrar/polygon?hole=${polyHole}&kind=${kind}&sort_order=${sortOrder}&course_id=${CCQ_COURSE_ID}&tg=${encodeURIComponent(tgId)}`,
          { method: "DELETE" }
        );
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error");
        flash("ok", note);
        return;
      }
      const geo =
        kind === "centerline" || kind === "ob"
          ? lineFromWaypoints(ring)
          : polygonFromRing(polyHole, ring).geometry;
      const url =
        kind === "boundary"
          ? "/api/captura/calibrar/boundary"
          : "/api/captura/calibrar/polygon";
      const body =
        kind === "boundary"
          ? { tg: tgId, course_id: CCQ_COURSE_ID, hole, polygon: geo }
          : {
              tg: tgId,
              course_id: CCQ_COURSE_ID,
              hole: polyHole,
              kind,
              polygon: geo,
              sort_order: sortOrder,
            };
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

  /** Reescribe TODOS los polígonos de un tipo (bunker/lago) con sort_order
   *  contiguo (0..n-1). Se usa al borrar uno para no dejar huecos en los slots. */
  const persistAllMulti = async (
    kind: MultiKind,
    prevLen: number,
    next: LatLon[][]
  ) => {
    const polyHole = holeForKind(kind, hole);
    setBusy(true);
    try {
      // Borra slots sobrantes (los índices ya no usados al final).
      for (let i = next.length; i < prevLen; i++) {
        await fetch(
          `/api/captura/calibrar/polygon?hole=${polyHole}&kind=${kind}&sort_order=${i}&course_id=${CCQ_COURSE_ID}&tg=${encodeURIComponent(tgId)}`,
          { method: "DELETE" }
        );
      }
      // Reescribe cada slot (polígono o línea OB).
      for (let i = 0; i < next.length; i++) {
        const geo =
          kind === "ob"
            ? lineFromWaypoints(next[i])
            : polygonFromRing(polyHole, next[i]).geometry;
        await fetch("/api/captura/calibrar/polygon", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tg: tgId,
            course_id: CCQ_COURSE_ID,
            hole: polyHole,
            kind,
            polygon: geo,
            sort_order: i,
          }),
        });
      }
      flash("ok", `${MULTI_META[kind].label} actualizados.`);
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const saveVertex = async (index: number, lat: number, lon: number) => {
    if (!activeKind) return;
    const next = activeRing.map((v, i) => (i === index ? { lat, lon } : v));
    setActiveRing(next);
    await persistRing(
      activeKind,
      next,
      `Punto ${index + 1} guardado.`,
      activeSortOrder
    );
  };

  /** Agrega un punto al final del contorno/línea (para ir trazando uno nuevo). */
  const appendPoint = async (lat: number, lon: number) => {
    if (!activeKind) return;
    const next = [...activeRing, { lat, lon }];
    setActiveRing(next);
    setSelectedVertex(next.length - 1);
    if (next.length >= minPoints(activeKind)) {
      await persistRing(
        activeKind,
        next,
        `Punto ${next.length} agregado.`,
        activeSortOrder
      );
    }
  };

  const deleteVertex = async () => {
    if (!activeKind) return;
    const min = minPoints(activeKind);
    if (activeRing.length <= min) {
      // Bunker/lago en el mínimo: borrar punto = borrar el polígono completo.
      if (multiKind && activePoly != null) {
        const prevLen = multiList.length;
        const next = multiList.filter((_, idx) => idx !== activePoly);
        setMultiList(next);
        setActivePoly(null);
        setSelectedVertex(0);
        setAddingCorner(false);
        await persistAllMulti(multiKind, prevLen, next);
        return;
      }
      // Fairway/centro: borrar todo deja la línea sin dibujar.
      if (
        (activeKind === "fairway" || activeKind === "centerline") &&
        activeRing.length > 0
      ) {
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
    await persistRing(activeKind, next, "Punto borrado.", activeSortOrder);
  };

  /** Cierra el contorno activo (fairway, bunker, lago o green). OB = línea abierta, no se cierra. */
  const closeRing = async () => {
    if (multiKind === "ob") return;
    if (activeKind !== "fairway" && !multiKind) return;
    if (activeRing.length < 3) {
      flash("err", "Mínimo 3 puntos para cerrar.");
      return;
    }
    setAddingCorner(false);
    const note =
      activeKind === "fairway"
        ? "Fairway cerrado."
        : `${MULTI_META[multiKind as MultiKind].one} cerrado.`;
    await persistRing(activeKind!, activeRing, note, activeSortOrder);
  };

  /** Crea un polígono nuevo (bunker/lago) vacío y entra en "agregar tocando". */
  const addPoly = () => {
    if (!multiKind) return;
    setMultiList((prev) => {
      const next = [...prev, []];
      setActivePoly(next.length - 1);
      return next;
    });
    setSelectedVertex(0);
    setAddingCorner(true);
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
    // Fairway: tocar cerca del punto 1 cierra el polígono (hoyos largos).
    // Bunker/lago/green: se cierran tocando el punto 1 o el botón «Cerrar».
    // OB: línea abierta — cada toque solo agrega puntos, sin cierre.
    if (
      activeKind === "fairway" &&
      activeRing.length >= 3 &&
      haversineMeters(lat, lon, activeRing[0].lat, activeRing[0].lon) < 14
    ) {
      void closeRing();
      return;
    }
    // Modo agregar: cada toque agrega el siguiente punto del contorno en orden.
    void appendPoint(lat, lon);
  };

  const switchMode = (next: SimpleCalibrarMode) => {
    setMode(next);
    setSelectedVertex(0);
    setActivePoly(null);
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
        : multiKind
          ? MULTI_META[multiKind].one
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
            bunkers={bunkers}
            waters={waters}
            greenAreas={greenAreas}
            obAreas={obAreas}
            activePolyIndex={activePoly}
            addingCorner={addingCorner}
            selectedGreen={selectedGreen}
            selectedVertex={selectedVertex}
            onGreenMove={saveGreen}
            onVertexMove={saveVertex}
            onVertexSelect={setSelectedVertex}
            onCloseRing={
              (mode === "fairway" ||
                (multiKind != null && multiKind !== "ob")) &&
              addingCorner
                ? closeRing
                : undefined
            }
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
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => switchMode("green")}
            className={[
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
              mode === "green"
                ? "bg-emerald-500 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Pts green
          </button>
          <button
            type="button"
            onClick={() => switchMode("greenarea")}
            className={[
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
              mode === "greenarea"
                ? "bg-green-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Área green
          </button>
          <button
            type="button"
            onClick={() => switchMode("boundary")}
            className={[
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
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
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
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
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
              mode === "centerline"
                ? "bg-orange-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Centro
          </button>
          <button
            type="button"
            onClick={() => switchMode("bunker")}
            className={[
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
              mode === "bunker"
                ? "bg-amber-200 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Bunkers
          </button>
          <button
            type="button"
            onClick={() => switchMode("water")}
            className={[
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
              mode === "water"
                ? "bg-sky-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            Lagos
          </button>
          <button
            type="button"
            onClick={() => switchMode("ob")}
            className={[
              "flex-1 basis-[22%] rounded-lg py-2.5 text-[11px] font-bold",
              mode === "ob"
                ? "bg-red-500 text-white"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            OB
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
        ) : multiKind ? (
          (() => {
            const meta = MULTI_META[multiKind];
            const chipActive =
              multiKind === "water"
                ? "border-sky-300 bg-sky-400 text-black"
                : multiKind === "green"
                  ? "border-green-300 bg-green-400 text-black"
                  : multiKind === "ob"
                    ? "border-red-400 bg-red-500 text-white"
                    : "border-amber-200 bg-amber-200 text-black";
            const closeBtn =
              multiKind === "water"
                ? "border-sky-300 bg-sky-400 text-black"
                : multiKind === "green"
                  ? "border-green-300 bg-green-400 text-black"
                  : multiKind === "ob"
                    ? "border-red-400 bg-red-500 text-white"
                    : "border-amber-300 bg-amber-200 text-black";
            return (
              <>
                <div className="flex gap-1 overflow-x-auto pb-0.5">
                  {multiList.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => {
                        setActivePoly(i);
                        setSelectedVertex(0);
                        setAddingCorner(false);
                      }}
                      className={[
                        "shrink-0 rounded-lg border px-3 py-2 text-[11px] font-bold",
                        activePoly === i
                          ? chipActive
                          : "border-slate-600 bg-slate-800 text-white",
                      ].join(" ")}
                    >
                      {meta.prefix}
                      {i + 1}
                    </button>
                  ))}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={addPoly}
                    className="shrink-0 rounded-lg border border-emerald-500 bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white disabled:opacity-50"
                  >
                    ＋ Nuevo
                  </button>
                </div>
                {activePoly != null ? (
                  <>
                    {activeRing.length > 0 ? (
                      <div className="mt-1 flex gap-1 overflow-x-auto pb-0.5">
                        {activeRing.map((_, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedVertex(i)}
                            className={[
                              "shrink-0 rounded-lg border px-3 py-2 text-[11px] font-bold",
                              selectedVertex === i
                                ? chipActive
                                : "border-slate-600 bg-slate-800 text-white",
                            ].join(" ")}
                          >
                            {i + 1}
                          </button>
                        ))}
                      </div>
                    ) : null}
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
                      {addingCorner && multiKind !== "ob" && activeRing.length >= 3 ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void closeRing()}
                          className={`shrink-0 rounded-lg border px-3 py-2 text-[11px] font-bold disabled:opacity-50 ${closeBtn}`}
                        >
                          Cerrar
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void deleteVertex()}
                        className="flex-1 rounded-lg border border-red-600/60 bg-red-900/40 py-2 text-[11px] font-bold text-red-200 disabled:opacity-40"
                      >
                        {activeRing.length <= minPoints(multiKind)
                          ? `Borrar ${meta.one}`
                          : `Borrar punto ${selectedVertex + 1}`}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="mt-1 rounded-lg bg-slate-800 px-3 py-2 text-center text-[11px] text-slate-300">
                    {multiList.length === 0
                      ? multiKind === "ob"
                        ? "No hay OB. Toca «＋ Nuevo» y traza la línea tocando el mapa (mínimo 2 puntos)."
                        : `No hay ${meta.label.toLowerCase()}. Toca «＋ Nuevo» y marca el contorno tocando el mapa.`
                      : `Elige un ${meta.one} (${meta.prefix}1, ${meta.prefix}2…) para ajustarlo o «＋ Nuevo» para otro.`}
                  </div>
                )}
              </>
            );
          })()
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
            : addingCorner && mode === "fairway"
              ? "Toca el mapa para ir agregando puntos en orden. Con 3+ puntos, toca el punto 1 (Cerrar) para unir con el primero."
              : addingCorner && multiKind && multiKind !== "ob"
                ? "Toca el mapa para agregar puntos en orden. Con 3+ puntos usa «Cerrar» o toca el punto 1 en el mapa."
                : addingCorner && multiKind === "ob"
                  ? "Toca el mapa para trazar la línea OB. Con 2+ puntos ya se guarda; no hace falta cerrar."
                  : addingCorner
                    ? `Toca el mapa para ir agregando el contorno del ${ringLabel} en orden.`
                    : multiKind
                      ? multiKind === "ob"
                        ? "Elige un OB para arrastrar sus puntos, o crea uno nuevo. Es una línea abierta (sin cierre)."
                        : `Elige un ${MULTI_META[multiKind].one} para arrastrar sus puntos, o crea uno nuevo. Donde no aplique, bórralo.`
                      : `Arrastra un punto del ${ringLabel}, o usa «+ Agregar tocando» para crear nuevos.`}
        </p>
      </div>
    </div>
  );
}
