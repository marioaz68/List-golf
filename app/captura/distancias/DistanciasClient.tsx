"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { computeAllHoleDistances, haversineMeters } from "@/lib/distances/ccqGreens";
import {
  CCQ_HOLE_POINTS,
  greenDistancesForHole,
  referenceDistancesForHole,
  yardsBetween,
  type HoleGreenPoints,
  type ReferencePoint,
} from "@/lib/distances/ccqHolePoints";
import {
  detectHole,
  seedAutoHole,
  type CenterlinesByHole,
  type GreenCentersByHole,
  type TeesByHole,
} from "@/lib/distances/detectActiveHole";
import {
  centerlineSegmentIndex,
  waypointsFromLine,
} from "@/lib/distances/centerline";
import { resolveHoleGreenPoints } from "@/lib/distances/greenPoints";
import { defaultDistanciasCourseId } from "@/lib/distances/loadCourseReferencePoints";
import { parsePolygonsFromApi } from "@/lib/distances/holeBoundary";
import {
  activeHoleInBoundsRefs,
  detectLieAtPoint,
  lieArrivalPhrase,
  type LieKind,
} from "@/lib/distances/detectLie";
import {
  isTapInPutt,
  puttYardsFromCenter,
  shouldPromptHoleFinish,
} from "@/lib/distances/holeComplete";
import {
  buildCourseHolesCollection,
  parseBoundariesPayload,
} from "@/lib/distances/resolveCourseHoles";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import type { FeatureCollection, Polygon } from "@/lib/telegram/ritmo/geometry";
import type { TapPoint } from "@/components/captura/HoleYardageMap";
import { HoleShotsDetailSheet } from "@/components/captura/HoleShotsDetailSheet";
import { MapFocusTopBar } from "@/components/captura/MapFocusTopBar";
import { LieChip } from "@/components/captura/LieChip";
import { MapTapActions } from "@/components/captura/MapTapActions";
import { PlayerBagSheet } from "@/components/captura/PlayerBagSheet";
import { ShotPlanPanel } from "@/components/captura/ShotPlanPanel";
import type { SwingKind } from "@/lib/distances/clubCatalog";
import {
  defaultPlayerBag,
  loadPlayerBag,
  savePlayerBag,
  type PlayerBag,
} from "@/lib/distances/playerBag";
import type { GreenDistances } from "@/lib/distances/suggestClub";
import {
  addPlannedShot,
  addFinalGreenPutt,
  completedStrokeCount,
  cancelPendingShot,
  ensureObPenaltyStroke,
  clearHoleShots,
  completeShotArrival,
  hasHoleTeeMark,
  hasLoggedShotsOnHole,
  holeTeeMark,
  isGivenPuttRecorded,
  isTapInPendingPutt,
  lastBallPosition,
  lastCompletedShot,
  loadHoleShots,
  pendingShotOnHole,
  resetShotArrival,
  saveHoleShots,
  setHoleTeeMark,
  shotsForHole,
  type HoleShotsStore,
} from "@/lib/distances/holeShots";

function framingPinAt(
  point: { lat: number; lon: number },
  centerline: Array<{ lat: number; lon: number }> | undefined
): { lat: number; lon: number; segmentIdx: number } {
  return {
    lat: point.lat,
    lon: point.lon,
    segmentIdx:
      centerline && centerline.length >= 2
        ? centerlineSegmentIndex(point, centerline)
        : 0,
  };
}

function MapSkeleton() {
  return (
    <div className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-sm text-slate-400">
      Cargando mapa…
    </div>
  );
}

const HoleYardageMap = dynamic(
  () =>
    import("@/components/captura/HoleYardageMap").then((m) => m.HoleYardageMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; lat: number; lon: number; accuracy: number; ts: number };

/** Radio (m) desde el green más cercano dentro del cual la pantalla mide
 *  yardas. Generoso para cubrir el campo + el fraccionamiento aledaño. */
const MAX_DISTANCE_FROM_COURSE_M = 300;

type PaceColor = "red" | "yellow" | "green" | "blue" | "none";

interface PaceState {
  ok: boolean;
  status: string;
  color: PaceColor;
  deltaMinutes: number | null;
  hoyo?: number | null;
  windowStart?: string | null;
  windowEnd?: string | null;
}

const PACE_STYLE: Record<
  Exclude<PaceColor, "none">,
  { box: string; title: string; label: string }
> = {
  red: {
    box: "border-red-500 bg-red-600",
    title: "ATRASADO",
    label: "text-red-50",
  },
  yellow: {
    box: "border-amber-400 bg-amber-500",
    title: "CUIDADO",
    label: "text-amber-950",
  },
  green: {
    box: "border-emerald-400 bg-emerald-600",
    title: "EN RITMO",
    label: "text-emerald-50",
  },
  blue: {
    box: "border-sky-400 bg-sky-600",
    title: "ADELANTADO",
    label: "text-sky-50",
  },
};

function timeAgo(ms: number): string {
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

export default function DistanciasClient({ demoMode = false }: { demoMode?: boolean }) {
  const [geo, setGeo] = useState<GeoState>(
    demoMode ? { status: "idle" } : { status: "idle" }
  );
  const [manualHole, setManualHole] = useState<number | null>(demoMode ? 1 : null);
  /** En demo: 0 = tee, 1 = casi en el green (simula caminar el hoyo). */
  const [demoProgress, setDemoProgress] = useState(0.35);
  const [tapPoint, setTapPoint] = useState<TapPoint | null>(null);
  /** Yardas al centro del green desde el punto tocado (objetivo de golpe). */
  const [targetYards, setTargetYards] = useState(0);
  const [bagOpen, setBagOpen] = useState(false);
  const [bag, setBag] = useState<PlayerBag>(() => defaultPlayerBag());
  /** Demo golpes: toque pendiente D/G, plan abierto, medir una vez desde teléfono. */
  const [holeShotsStore, setHoleShotsStore] = useState<HoleShotsStore>(() =>
    loadHoleShots(undefined)
  );
  const [pendingTap, setPendingTap] = useState<{ lat: number; lon: number } | null>(
    null
  );
  const [shotPlanOpen, setShotPlanOpen] = useState(false);
  /** Incrementa al abrir planificador para remontar con nueva distancia/bastón. */
  const [planSession, setPlanSession] = useState(0);
  /** Contexto del planificador: distancia al green + bastón sugerido desde ese punto. */
  const [planContext, setPlanContext] = useState<{
    yardsToGreen: number;
    greenDist: GreenDistances;
    lieKind: LieKind;
    onGreen: boolean;
    inBunker: boolean;
  } | null>(null);
  const [shotsDetailOpen, setShotsDetailOpen] = useState(false);
  const [measureFromPhoneOnce, setMeasureFromPhoneOnce] = useState(false);
  const [distanceMode, setDistanceMode] = useState(false);
  const [arrivalToast, setArrivalToast] = useState<string | null>(null);
  /** Tras caída a ~0 yds: confirmar si el hoyo terminó o sigue jugando. */
  const [holeFinishPrompt, setHoleFinishPrompt] = useState<{
    lat: number;
    lon: number;
    strokeCount: number;
    hole: number;
    centerYards: number;
  } | null>(null);
  /** Fuerza remount/reencuadre del mapa al cambiar de hoyo. */
  const [mapFrameEpoch, setMapFrameEpoch] = useState(0);
  /** Tras OB: fija foto en el tramo donde pegaste, no en la salida ni en el OB. */
  const [mapFramingLock, setMapFramingLock] = useState<{
    lat: number;
    lon: number;
    segmentIdx: number;
  } | null>(null);
  const [customPoints, setCustomPoints] = useState<ReferencePoint[]>([]);
  const [holeGreen, setHoleGreen] = useState<HoleGreenPoints | null>(null);
  const [pace, setPace] = useState<PaceState | null>(null);
  const [courseHoles, setCourseHoles] =
    useState<FeatureCollection<Polygon, { hoyo: number }>>(CCQ_HOLES);
  const [boundaryByHole, setBoundaryByHole] = useState<
    Map<number, Polygon>
  >(() => new Map());
  const [greenPolygonsByHole, setGreenPolygonsByHole] = useState<
    Map<number, Polygon[]>
  >(() => new Map());
  const [bunkerPolygonsByHole, setBunkerPolygonsByHole] = useState<
    Map<number, Polygon[]>
  >(() => new Map());
  const [bunkerPointsByHole, setBunkerPointsByHole] = useState<
    Map<number, Array<{ lat: number; lon: number }>>
  >(() => new Map());
  const [fairwayPolygonsByHole, setFairwayPolygonsByHole] = useState<
    Map<number, Polygon[]>
  >(() => new Map());
  const [waterPolygonsByHole, setWaterPolygonsByHole] = useState<
    Map<number, Polygon[]>
  >(() => new Map());
  const [waterPointsByHole, setWaterPointsByHole] = useState<
    Map<number, Array<{ lat: number; lon: number }>>
  >(() => new Map());
  const [obLines, setObLines] = useState<Array<Array<{ lat: number; lon: number }>>>(
    () => []
  );
  const [greenCenters, setGreenCenters] = useState<GreenCentersByHole>(() => {
    const out: GreenCentersByHole = {};
    for (let h = 1; h <= 18; h++) {
      const hp = CCQ_HOLE_POINTS[h];
      if (hp) out[h] = hp.center;
    }
    return out;
  });
  // Línea central de fairway por hoyo (salida→green). Señal principal para
  // detectar el hoyo y para orientar la foto siguiendo el fairway (doglegs).
  const [centerlines, setCenterlines] = useState<CenterlinesByHole>({});
  // Salidas por hoyo: ancla para detectar el hoyo cuando estás fuera de los
  // polígonos (tees de atrás). Por ahora derivadas del polígono base.
  const teeCenters = useMemo<TeesByHole>(() => {
    const out: TeesByHole = {};
    for (let h = 1; h <= 18; h++) {
      const hp = CCQ_HOLE_POINTS[h];
      if (hp?.tee) out[h] = hp.tee;
    }
    return out;
  }, []);
  const watchIdRef = useRef<number | null>(null);
  // Última posición aceptada. Sirve para ignorar el micro-jitter del GPS
  // (cambios de 1-2 m cada segundo aunque estés parado) que hacía parpadear y
  // re-encuadrar el mapa constantemente.
  const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
  // Hoyo detectado en el momento que el usuario fijó el hoyo a mano. Al entrar
  // a un hoyo distinto (el GPS detecta otro polígono), se reanuda el automático.
  const manualAtDetectedRef = useRef<number | null>(null);

  const searchParams = useSearchParams();
  const bagScope =
    searchParams.get("tg")?.trim() ||
    searchParams.get("me")?.trim() ||
    undefined;

  useEffect(() => {
    setBag(loadPlayerBag(bagScope));
    setHoleShotsStore(loadHoleShots(bagScope));
  }, [bagScope]);

  useEffect(() => {
    if (!demoMode) return;
    setHoleShotsStore((prev) => {
      const next = clearHoleShots(prev, 1);
      saveHoleShots(next, bagScope);
      return next;
    });
    setManualHole(1);
  }, [demoMode, bagScope]);

  const actorQuery = useMemo(() => {
    const me = searchParams.get("me") || searchParams.get("entry_id");
    const caddie = searchParams.get("caddie") || searchParams.get("caddie_id");
    const tg = searchParams.get("tg");
    const parts: string[] = [];
    if (me) parts.push(`me=${encodeURIComponent(me)}`);
    if (caddie) parts.push(`caddie=${encodeURIComponent(caddie)}`);
    if (tg) parts.push(`tg=${encodeURIComponent(tg)}`);
    return parts.join("&");
  }, [searchParams]);

  useEffect(() => {
    if (demoMode) return;
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeo({
        status: "error",
        message: "Este dispositivo no expone GPS al navegador.",
      });
      return;
    }
    setGeo({ status: "requesting" });
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const last = lastPosRef.current;
        // Solo actualiza si te moviste de verdad (> 4 m). Estando parado, el
        // GPS salta 1-2 m por segundo; ignorarlo mantiene la foto fija.
        if (last && haversineMeters(last.lat, last.lon, lat, lon) < 4) {
          return;
        }
        lastPosRef.current = { lat, lon };
        setGeo({
          status: "ok",
          lat,
          lon,
          accuracy: pos.coords.accuracy ?? 0,
          ts: Date.now(),
        });
      },
      (err) => {
        if (err.code === 1) {
          setGeo({
            status: "denied",
            message:
              "Permiso de ubicación bloqueado. Habilita el GPS para esta página.",
          });
        } else {
          setGeo({
            status: "error",
            message: err.message || "Error obteniendo posición.",
          });
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [demoMode]);

  // Polígonos calibrados + greens de los 18 hoyos (una sola llamada al abrir).
  useEffect(() => {
    let cancelled = false;
    const courseId = defaultDistanciasCourseId();
    (async () => {
      try {
        const res = await fetch(
          `/api/captura/distancias/course-layout?course_id=${courseId}`
        );
        const data = (await res.json()) as {
          ok?: boolean;
          boundaries?: Array<{ hole_number: number; polygon: unknown }>;
          greens?: Array<{
            hole_number: number;
            center: { lat: number; lon: number };
          }>;
          centerlines?: Array<{
            hole_number: number;
            waypoints?: Array<{ lat: number; lon: number }>;
          }>;
          green_polygons?: Array<{
            hole_number: number;
            polygons: Polygon[];
          }>;
          bunker_polygons?: Array<{
            hole_number: number;
            polygons: Polygon[];
          }>;
          bunker_points?: Array<{
            hole_number: number;
            points: Array<{ lat: number; lon: number }>;
          }>;
          fairway_polygons?: Array<{
            hole_number: number;
            polygons: Polygon[];
          }>;
          water_polygons?: Array<{
            hole_number: number;
            polygons: Polygon[];
          }>;
          water_points?: Array<{
            hole_number: number;
            points: Array<{ lat: number; lon: number }>;
          }>;
          ob_lines?: Array<Array<{ lat: number; lon: number }>>;
        };
        if (cancelled || !data.ok) return;
        const calibrated = parseBoundariesPayload(data.boundaries ?? []);
        setBoundaryByHole(calibrated);
        setCourseHoles(buildCourseHolesCollection(calibrated));
        const centers: GreenCentersByHole = {};
        for (const g of data.greens ?? []) {
          if (g.center) centers[g.hole_number] = g.center;
        }
        setGreenCenters(centers);
        const cls: CenterlinesByHole = {};
        for (const c of data.centerlines ?? []) {
          const wps = Array.isArray(c.waypoints)
            ? c.waypoints
            : waypointsFromLine(c as unknown);
          if (wps && wps.length >= 2) cls[c.hole_number] = wps;
        }
        setCenterlines(cls);
        const gpMap = new Map<number, Polygon[]>();
        for (const g of data.green_polygons ?? []) {
          const polys = parsePolygonsFromApi(g.polygons);
          if (polys.length) gpMap.set(g.hole_number, polys);
        }
        setGreenPolygonsByHole(gpMap);
        const bkPolyMap = new Map<number, Polygon[]>();
        for (const b of data.bunker_polygons ?? []) {
          const polys = parsePolygonsFromApi(b.polygons);
          if (polys.length) bkPolyMap.set(b.hole_number, polys);
        }
        setBunkerPolygonsByHole(bkPolyMap);
        const bkPtMap = new Map<
          number,
          Array<{ lat: number; lon: number }>
        >();
        for (const b of data.bunker_points ?? []) {
          if (b.points?.length) bkPtMap.set(b.hole_number, b.points);
        }
        setBunkerPointsByHole(bkPtMap);
        const fwMap = new Map<number, Polygon[]>();
        for (const f of data.fairway_polygons ?? []) {
          const polys = parsePolygonsFromApi(f.polygons);
          if (polys.length) fwMap.set(f.hole_number, polys);
        }
        setFairwayPolygonsByHole(fwMap);
        const wPolyMap = new Map<number, Polygon[]>();
        for (const w of data.water_polygons ?? []) {
          const polys = parsePolygonsFromApi(w.polygons);
          if (polys.length) wPolyMap.set(w.hole_number, polys);
        }
        setWaterPolygonsByHole(wPolyMap);
        const wPtMap = new Map<
          number,
          Array<{ lat: number; lon: number }>
        >();
        for (const w of data.water_points ?? []) {
          if (w.points?.length) wPtMap.set(w.hole_number, w.points);
        }
        setWaterPointsByHole(wPtMap);
        setObLines(data.ob_lines ?? []);
      } catch {
        /* mantiene CCQ_HOLES por defecto */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Hoyo detectado: manda la línea central de fairway más cercana; si no estás
  // sobre ninguna, el polígono que te contiene (desempate por centerline/green).
  const insideHole = useMemo(() => {
    if (geo.status !== "ok") return null;
    return detectHole(
      { lat: geo.lat, lon: geo.lon },
      courseHoles,
      greenCenters,
      centerlines
    );
  }, [geo, courseHoles, greenCenters, centerlines]);

  const nearest = useMemo(() => {
    if (geo.status !== "ok") return null;
    const sorted = computeAllHoleDistances(geo.lat, geo.lon);
    return sorted[0] ?? null;
  }, [geo]);

  const nearestHole = nearest?.holeNo ?? 1;

  // Solo tiene sentido medir si estás en el club o el fraccionamiento aledaño.
  // Si el GPS te ubica a más de este radio del green más cercano, no medimos
  // (evita yardas absurdas cuando alguien abre la pantalla desde su casa lejos).
  const farFromCourse =
    !demoMode &&
    geo.status === "ok" &&
    nearest != null &&
    nearest.distanceMeters > MAX_DISTANCE_FROM_COURSE_M;

  // Hoyo automático "pegajoso" y SOLO ascendente: una vez en un hoyo, solo
  // puede avanzar al SIGUIENTE en orden (10→11, 9→10, 18→1). Nunca brinca
  // hacia atrás ni se salta hoyos. Cambia cuando entras DENTRO del polígono
  // del hoyo siguiente, confirmado en 2 lecturas seguidas.
  const [autoHole, setAutoHole] = useState<number | null>(null);
  const autoCandidateRef = useRef<{ hole: number; count: number }>({
    hole: 0,
    count: 0,
  });
  const layoutReseededRef = useRef(false);
  const prevActiveHoleRef = useRef<number | null>(null);

  // Al llegar polígonos calibrados, re-sembrar el hoyo (corrige 1→2 en la salida).
  useEffect(() => {
    const layoutReady =
      boundaryByHole.size > 0 || Object.keys(centerlines).length > 0;
    if (
      layoutReseededRef.current ||
      !layoutReady ||
      geo.status !== "ok" ||
      manualHole != null
    ) {
      return;
    }
    layoutReseededRef.current = true;
    autoCandidateRef.current = { hole: 0, count: 0 };
    setAutoHole(
      seedAutoHole(
        { lat: geo.lat, lon: geo.lon },
        courseHoles,
        greenCenters,
        teeCenters,
        centerlines
      )
    );
  }, [
    boundaryByHole.size,
    geo,
    manualHole,
    courseHoles,
    greenCenters,
    teeCenters,
    centerlines,
  ]);

  useEffect(() => {
    if (geo.status !== "ok") return;
    const pos = { lat: geo.lat, lon: geo.lon };
    setAutoHole((prev) => {
      if (prev == null) {
        autoCandidateRef.current = { hole: 0, count: 0 };
        return seedAutoHole(pos, courseHoles, greenCenters, teeCenters, centerlines);
      }
      // Solo aceptamos el hoyo siguiente en orden (envuelve 18→1).
      const expectedNext = (prev % 18) + 1;
      if (insideHole !== expectedNext) {
        autoCandidateRef.current = { hole: 0, count: 0 };
        return prev;
      }
      const cand = autoCandidateRef.current;
      if (cand.hole === insideHole) {
        cand.count += 1;
      } else {
        autoCandidateRef.current = { hole: insideHole, count: 1 };
      }
      if (autoCandidateRef.current.count >= 2) {
        autoCandidateRef.current = { hole: 0, count: 0 };
        return expectedNext;
      }
      return prev;
    });
  }, [insideHole, geo, courseHoles, greenCenters, teeCenters, centerlines]);

  const activeHole = manualHole ?? autoHole ?? nearestHole;

  // Reanudar automático SOLO cuando caminas al hoyo SIGUIENTE al que fijaste a
  // mano. Cruzar por cualquier otro hoyo (traslapes) NO descarta tu elección
  // manual: se respeta hasta que llegas al que sigue en orden.
  useEffect(() => {
    if (manualHole == null || insideHole == null) return;
    const expectedNext = (manualHole % 18) + 1;
    if (insideHole === expectedNext) {
      setAutoHole(expectedNext);
      setManualHole(null);
      setTapPoint(null);
    }
  }, [insideHole, manualHole]);

  const catalogTeeForHole = useMemo(
    () => CCQ_HOLE_POINTS[activeHole]?.tee ?? teeCenters[activeHole] ?? null,
    [activeHole, teeCenters]
  );

  useEffect(() => {
    setHoleGreen(CCQ_HOLE_POINTS[activeHole] ?? null);
    setCustomPoints([]);
    setMapFrameEpoch((e) => e + 1);
    let cancelled = false;
    const courseId = defaultDistanciasCourseId();
    (async () => {
      try {
        const [ptsRes, greenRes] = await Promise.all([
          fetch(
            `/api/captura/distancias/points?hole=${activeHole}&course_id=${courseId}`
          ),
          fetch(
            `/api/captura/distancias/greens?hole=${activeHole}&course_id=${courseId}`
          ),
        ]);
        const ptsData = (await ptsRes.json()) as {
          ok?: boolean;
          points?: Array<{
            id: string;
            label: string;
            short_label: string;
            kind: string;
            lat: number;
            lon: number;
          }>;
        };
        const greenData = (await greenRes.json()) as {
          ok?: boolean;
          front?: { lat: number; lon: number };
          center?: { lat: number; lon: number };
          back?: { lat: number; lon: number };
          source?: string;
        };
        if (cancelled) return;

        if (ptsData.ok && ptsData.points) {
          setCustomPoints(
            ptsData.points.map((p) => ({
              id: p.id,
              label: p.label,
              shortLabel: p.short_label,
              lat: p.lat,
              lon: p.lon,
              kind: "custom" as const,
              dbKind: p.kind,
            }))
          );
        } else {
          setCustomPoints([]);
        }

        if (greenData.ok && greenData.source === "db" && greenData.front && greenData.center && greenData.back) {
          setHoleGreen(
            resolveHoleGreenPoints(activeHole, {
              holeNumber: activeHole,
              front: greenData.front,
              center: greenData.center,
              back: greenData.back,
            })
          );
        } else {
          setHoleGreen(CCQ_HOLE_POINTS[activeHole] ?? null);
        }
      } catch {
        if (!cancelled) {
          setCustomPoints([]);
          setHoleGreen(CCQ_HOLE_POINTS[activeHole] ?? null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeHole]);

  const activeHolePoints = useMemo(() => {
    if (holeGreen?.holeNo === activeHole) return holeGreen;
    return CCQ_HOLE_POINTS[activeHole] ?? null;
  }, [holeGreen, activeHole]);

  const pendingShot = useMemo(
    () => pendingShotOnHole(holeShotsStore, activeHole),
    [holeShotsStore, activeHole]
  );

  const lastCompletedShotOnHole = useMemo(
    () => lastCompletedShot(holeShotsStore, activeHole),
    [holeShotsStore, activeHole]
  );

  const lastBall = useMemo(() => {
    return lastBallPosition(
      holeShotsStore,
      activeHole,
      catalogTeeForHole ?? undefined
    );
  }, [holeShotsStore, activeHole, catalogTeeForHole]);

  const teeMark = useMemo(
    () => holeTeeMark(holeShotsStore, activeHole),
    [holeShotsStore, activeHole]
  );

  const pinMapFraming = useCallback(
    (point: { lat: number; lon: number }) => {
      setMapFramingLock(framingPinAt(point, centerlines[activeHole]));
    },
    [activeHole, centerlines]
  );

  const hasTeeMark = hasHoleTeeMark(holeShotsStore, activeHole);
  const needsTeeMark = !hasTeeMark;

  const shotsOnHole = useMemo(
    () => shotsForHole(holeShotsStore, activeHole),
    [holeShotsStore, activeHole]
  );

  const completedShotsCount = shotsOnHole.filter(
    (s) => s.completedAt != null
  ).length;

  const canAdjustTee =
    hasTeeMark && completedShotsCount === 0 && pendingShot == null;

  // Fija el hoyo mientras falta marcar salida para que el círculo verde no
  // salte a otro hoyo si el GPS auto-detecta mal.
  useEffect(() => {
    if (!needsTeeMark) return;
    setManualHole((prev) => prev ?? activeHole);
  }, [needsTeeMark, activeHole]);

  const shotLandings = useMemo(
    () =>
      shotsOnHole
        .filter((s) => s.completedAt != null && s.to && !s.isPenalty)
        .sort((a, b) => a.strokeNo - b.strokeNo)
        .map((s) => ({
          lat: s.to!.lat,
          lon: s.to!.lon,
          strokeNo: s.strokeNo,
        })),
    [shotsOnHole]
  );

  const playBallPoint = useMemo(() => {
    if (pendingShot?.from) return pendingShot.from;
    if (mapFramingLock) {
      return { lat: mapFramingLock.lat, lon: mapFramingLock.lon };
    }
    if (completedShotsCount > 0 && lastBall) return lastBall;
    if (teeMark) return teeMark;
    if (geo.status === "ok") return { lat: geo.lat, lon: geo.lon };
    return null;
  }, [
    geo,
    pendingShot,
    mapFramingLock,
    completedShotsCount,
    lastBall,
    teeMark,
  ]);

  /** Encuadre del mapa: siempre en la última bola (o replay tras OB). */
  const mapFramingPoint = useMemo(() => {
    if (mapFramingLock) return mapFramingLock;
    const pt =
      pendingShot?.from ??
      lastBall ??
      (needsTeeMark && catalogTeeForHole ? catalogTeeForHole : null) ??
      teeMark ??
      null;
    if (!pt) return null;
    return framingPinAt(pt, centerlines[activeHole]);
  }, [
    mapFramingLock,
    pendingShot,
    lastBall,
    needsTeeMark,
    catalogTeeForHole,
    teeMark,
    centerlines,
    activeHole,
  ]);

  const liveGreenYds = useMemo(() => {
    if (!activeHolePoints || needsTeeMark) return null;
    if (tapPoint) {
      return greenDistancesForHole(
        tapPoint.lat,
        tapPoint.lon,
        activeHolePoints
      );
    }
    if (lastBall) {
      return greenDistancesForHole(
        lastBall.lat,
        lastBall.lon,
        activeHolePoints
      );
    }
    if (teeMark) {
      return greenDistancesForHole(
        teeMark.lat,
        teeMark.lon,
        activeHolePoints
      );
    }
    if (geo.status === "ok") {
      return greenDistancesForHole(geo.lat, geo.lon, activeHolePoints);
    }
    return null;
  }, [activeHolePoints, needsTeeMark, tapPoint, lastBall, teeMark, geo]);

  const playGreenYds = useMemo(() => {
    if (!activeHolePoints || needsTeeMark) return null;
    if (tapPoint) {
      return greenDistancesForHole(
        tapPoint.lat,
        tapPoint.lon,
        activeHolePoints
      );
    }
    if (lastBall) {
      return greenDistancesForHole(
        lastBall.lat,
        lastBall.lon,
        activeHolePoints
      );
    }
    if (teeMark) {
      return greenDistancesForHole(
        teeMark.lat,
        teeMark.lon,
        activeHolePoints
      );
    }
    if (geo.status === "ok") {
      return greenDistancesForHole(geo.lat, geo.lon, activeHolePoints);
    }
    return null;
  }, [lastBall, teeMark, activeHolePoints, needsTeeMark, geo, tapPoint]);

  const topGreenYds = useMemo(() => {
    return playGreenYds;
  }, [playGreenYds]);

  const topGreenLabel = useMemo(() => {
    if (tapPoint) return "Punto marcado";
    if (hasLoggedShotsOnHole(holeShotsStore, activeHole)) return "Desde bola";
    if (teeMark) return "Desde salida";
    return "Posición";
  }, [tapPoint, holeShotsStore, activeHole, teeMark]);

  const measureAnchor = useMemo(() => {
    if (geo.status !== "ok") return null;
    const usePhone =
      measureFromPhoneOnce ||
      (!hasLoggedShotsOnHole(holeShotsStore, activeHole) &&
        !hasHoleTeeMark(holeShotsStore, activeHole));
    if (usePhone) {
      return { lat: geo.lat, lon: geo.lon, fromPhone: true as const };
    }
    if (lastBall) {
      return { lat: lastBall.lat, lon: lastBall.lon, fromPhone: false as const };
    }
    return { lat: geo.lat, lon: geo.lon, fromPhone: true as const };
  }, [
    geo,
    measureFromPhoneOnce,
    holeShotsStore,
    activeHole,
    lastBall,
  ]);

  const resetTapUi = useCallback(() => {
    setPendingTap(null);
    setShotPlanOpen(false);
    setPlanContext(null);
    setDistanceMode(false);
    setMeasureFromPhoneOnce(false);
  }, []);

  const detectLieForPoint = useCallback(
    (lat: number, lon: number) => {
      const physicalHole =
        detectHole(
          { lat, lon },
          courseHoles,
          greenCenters,
          centerlines
        ) ?? activeHole;
      const lieHoles =
        physicalHole === activeHole
          ? [activeHole]
          : [activeHole, physicalHole];

      const polysFor = (map: Map<number, Polygon[]>) => {
        const out: Polygon[] = [];
        for (const h of lieHoles) out.push(...(map.get(h) ?? []));
        return out;
      };
      const pointsFor = (map: Map<number, Array<{ lat: number; lon: number }>>) => {
        const out: Array<{ lat: number; lon: number }> = [];
        for (const h of lieHoles) out.push(...(map.get(h) ?? []));
        return out;
      };

      const bunkerPoints = [
        ...pointsFor(bunkerPointsByHole),
        ...customPoints
          .filter((p) => p.dbKind === "bunker")
          .map((p) => ({ lat: p.lat, lon: p.lon })),
      ];
      const waterPoints = [
        ...pointsFor(waterPointsByHole),
        ...customPoints
          .filter((p) => p.dbKind === "water")
          .map((p) => ({ lat: p.lat, lon: p.lon })),
      ];
      const inBoundsRefs = activeHoleInBoundsRefs({
        teeMark,
        tee: catalogTeeForHole,
        centerline: centerlines[activeHole],
        green: greenCenters[activeHole] ?? activeHolePoints?.center ?? null,
      });

      return detectLieAtPoint(
        lat,
        lon,
        polysFor(greenPolygonsByHole),
        polysFor(bunkerPolygonsByHole),
        bunkerPoints,
        activeHolePoints,
        {
          waterPolygons: polysFor(waterPolygonsByHole),
          waterPoints,
          fairwayPolygons: polysFor(fairwayPolygonsByHole),
          obLines,
          inBoundsRefs,
        }
      );
    },
    [
      activeHole,
      activeHolePoints,
      courseHoles,
      greenCenters,
      centerlines,
      catalogTeeForHole,
      teeMark,
      greenPolygonsByHole,
      bunkerPolygonsByHole,
      bunkerPointsByHole,
      waterPolygonsByHole,
      waterPointsByHole,
      fairwayPolygonsByHole,
      obLines,
      customPoints,
    ]
  );

  const openPlanFromPoint = useCallback(
    (lat: number, lon: number) => {
      if (!activeHolePoints) return;
      const dist = greenDistancesForHole(lat, lon, activeHolePoints);
      const lie = detectLieForPoint(lat, lon);
      const onGreen = lie.onGreen;
      const inBunker = lie.inBunker;
      const lieKind = lie.kind;
      const yardsToGreen = onGreen
        ? puttYardsFromCenter(dist.center)
        : Math.round(dist.center / 5) * 5;
      if (yardsToGreen <= 0) return;
      setPlanContext({
        yardsToGreen,
        greenDist: {
          front: dist.front,
          center: dist.center,
          back: dist.back,
        },
        lieKind,
        onGreen,
        inBunker,
      });
      setTargetYards(yardsToGreen);
      setPlanSession((s) => s + 1);
      setShotPlanOpen(true);
    },
    [activeHolePoints, detectLieForPoint, activeHole, greenPolygonsByHole]
  );

  const correctLastShotLanding = useCallback(
    (shotId?: string) => {
      const target =
        shotId != null
          ? shotsForHole(holeShotsStore, activeHole).find((s) => s.id === shotId)
          : lastCompletedShot(holeShotsStore, activeHole);
      if (!target || target.completedAt == null) return;
      const next = resetShotArrival(holeShotsStore, activeHole, target.id);
      setHoleShotsStore(next);
      saveHoleShots(next, bagScope);
      setHoleFinishPrompt(null);
      setShotPlanOpen(false);
      setPlanContext(null);
      setTapPoint(null);
      setPendingTap(null);
      setDistanceMode(false);
      setMeasureFromPhoneOnce(false);
      setShotsDetailOpen(false);
      setArrivalToast(
        `Golpe ${target.strokeNo} · toca de nuevo donde quedó la bola`
      );
    },
    [holeShotsStore, activeHole, bagScope]
  );

  const ballPointForLie = useMemo(() => {
    if (pendingShot?.from) return pendingShot.from;
    if (lastBall) return lastBall;
    if (teeMark) return teeMark;
    return null;
  }, [pendingShot, lastBall, teeMark]);

  const currentBallLie = useMemo((): {
    kind: LieKind;
    onGreen: boolean;
  } | null => {
    if (!hasTeeMark || !ballPointForLie) return null;
    if (shotPlanOpen && planContext) {
      return {
        kind: planContext.lieKind,
        onGreen: planContext.onGreen,
      };
    }
    const lastCompleted = [...shotsOnHole]
      .reverse()
      .find((s) => s.completedAt != null);
    if (
      lastCompleted?.lieKind &&
      lastBall &&
      lastCompleted.to &&
      lastCompleted.to.lat === lastBall.lat &&
      lastCompleted.to.lon === lastBall.lon
    ) {
      return {
        kind: lastCompleted.lieKind,
        onGreen: lastCompleted.lieKind === "green",
      };
    }
    const detected = detectLieForPoint(
      ballPointForLie.lat,
      ballPointForLie.lon
    );
    return { kind: detected.kind, onGreen: detected.onGreen };
  }, [
    hasTeeMark,
    ballPointForLie,
    shotPlanOpen,
    planContext,
    shotsOnHole,
    lastBall,
    detectLieForPoint,
    activeHolePoints,
    activeHole,
    greenPolygonsByHole,
  ]);

  const markTeeAt = useCallback(
    (lat: number, lon: number) => {
      const wasMarked = hasHoleTeeMark(holeShotsStore, activeHole);
      let next = setHoleTeeMark(holeShotsStore, activeHole, { lat, lon });
      const orphan = pendingShotOnHole(next, activeHole);
      if (orphan) {
        next = cancelPendingShot(next, activeHole, orphan.id);
      }
      const hasCompleted = shotsForHole(next, activeHole).some(
        (s) => s.completedAt != null
      );
      setHoleShotsStore(next);
      saveHoleShots(next, bagScope);
      setManualHole(activeHole);
      setPendingTap(null);
      setDistanceMode(false);
      setMeasureFromPhoneOnce(false);
      setTapPoint(null);
      if (!hasCompleted) {
        const toGreen =
          activeHolePoints != null
            ? Math.round(
                greenDistancesForHole(lat, lon, activeHolePoints).center / 5
              ) * 5
            : 0;
        if (toGreen > 0) setTargetYards(toGreen);
        pinMapFraming({ lat, lon });
        openPlanFromPoint(lat, lon);
        setArrivalToast(
          wasMarked
            ? `Salida corregida · ${toGreen} yds al centro`
            : `Salida marcada · ${toGreen} yds al centro`
        );
      } else {
        setShotPlanOpen(false);
        setArrivalToast(`Salida del hoyo ${activeHole} marcada`);
      }
    },
    [holeShotsStore, activeHole, bagScope, activeHolePoints, openPlanFromPoint, pinMapFraming]
  );

  const finishHoleAndAdvance = useCallback(
    (how: "in" | "given") => {
      if (!holeFinishPrompt) return;
      const { hole, strokeCount, lat, lon } = holeFinishPrompt;
      let nextStore = holeShotsStore;
      let totalStrokes = strokeCount;
      const pendingTapIn = isTapInPendingPutt(holeShotsStore, hole);

      if (how === "given" && !isGivenPuttRecorded(holeShotsStore, hole)) {
        if (pendingTapIn) {
          nextStore = completeShotArrival(
            holeShotsStore,
            hole,
            pendingTapIn.id,
            { lat, lon },
            Math.max(1, pendingTapIn.plannedYards),
            "given"
          );
          totalStrokes = strokeCount + 1;
          setHoleShotsStore(nextStore);
          saveHoleShots(nextStore, bagScope);
        } else {
          const from =
            lastBallPosition(nextStore, hole) ??
            holeTeeMark(nextStore, hole) ?? { lat, lon };
          nextStore = addFinalGreenPutt(
            nextStore,
            hole,
            from,
            { lat, lon },
            "given"
          );
          totalStrokes = strokeCount + 1;
          setHoleShotsStore(nextStore);
          saveHoleShots(nextStore, bagScope);
        }
      } else if (how === "in") {
        if (pendingTapIn) {
          nextStore = completeShotArrival(
            holeShotsStore,
            hole,
            pendingTapIn.id,
            { lat, lon },
            Math.max(1, pendingTapIn.plannedYards),
            "green"
          );
          totalStrokes = strokeCount + 1;
          setHoleShotsStore(nextStore);
          saveHoleShots(nextStore, bagScope);
        } else {
          // Entró al hundir en el mapa: el conteo ya incluye ese golpe.
          totalStrokes = strokeCount;
        }
      }

      const nextHoleNum = (hole % 18) + 1;
      nextStore = clearHoleShots(nextStore, nextHoleNum);
      setHoleShotsStore(nextStore);
      saveHoleShots(nextStore, bagScope);

      setHoleFinishPrompt(null);
      resetTapUi();
      setTapPoint(null);
      setPendingTap(null);
      autoCandidateRef.current = { hole: 0, count: 0 };
      setAutoHole(nextHoleNum);
      setManualHole(nextHoleNum);
      setTargetYards(0);
      if (demoMode) setDemoProgress(0);
      const howLabel = how === "given" ? " · quedó dada" : "";
      setArrivalToast(
        `Hoyo ${hole} terminado${howLabel} (${totalStrokes} golpes) · Pasa al hoyo ${nextHoleNum}`
      );
    },
    [
      holeFinishPrompt,
      holeShotsStore,
      activeHolePoints,
      bagScope,
      resetTapUi,
      insideHole,
      demoMode,
    ]
  );

  const showHoleFinishPrompt = useCallback(
    (
      lat: number,
      lon: number,
      strokeCount: number,
      centerYards: number,
      liePhrase?: string
    ) => {
      setShotPlanOpen(false);
      setPlanContext(null);
      setHoleFinishPrompt({
        lat,
        lon,
        strokeCount,
        hole: activeHole,
        centerYards,
      });
      setArrivalToast(
        liePhrase
          ? `A menos de 1 yd · ${liePhrase} · ¿entró al hoyo?`
          : `A menos de 1 yd al hoyo · ¿entró o quedó dada?`
      );
    },
    [activeHole]
  );

  const continueHoleAfterMiss = useCallback(() => {
    if (!holeFinishPrompt) return;
    const { lat, lon, strokeCount, hole } = holeFinishPrompt;
    setHoleFinishPrompt(null);
    setArrivalToast(
      `Golpe ${strokeCount} registrado · sigues en el hoyo ${hole}`
    );
    openPlanFromPoint(lat, lon);
  }, [holeFinishPrompt, openPlanFromPoint]);

  useEffect(() => {
    if (prevActiveHoleRef.current === activeHole) return;
    if (prevActiveHoleRef.current !== null) {
      resetTapUi();
      setTapPoint(null);
      setTargetYards(0);
      setShotsDetailOpen(false);
      setShotPlanOpen(false);
      setHoleFinishPrompt(null);
      setMapFramingLock(null);
    }
    prevActiveHoleRef.current = activeHole;
  }, [activeHole, resetTapUi]);

  useEffect(() => {
    if (hasTeeMark || !pendingShot) return;
    const next = cancelPendingShot(
      holeShotsStore,
      activeHole,
      pendingShot.id
    );
    setHoleShotsStore(next);
    saveHoleShots(next, bagScope);
    setShotPlanOpen(false);
  }, [hasTeeMark, pendingShot, holeShotsStore, activeHole, bagScope]);

  useEffect(() => {
    if (!arrivalToast || needsTeeMark || holeFinishPrompt) return;
    const ms =
      arrivalToast.includes("terminado") ||
      arrivalToast.includes("Pasa al hoyo") ||
      arrivalToast.includes("OB ·")
        ? 6000
        : 2500;
    const t = window.setTimeout(() => setArrivalToast(null), ms);
    return () => window.clearTimeout(t);
  }, [arrivalToast, needsTeeMark, holeFinishPrompt]);

  useEffect(() => {
    if (needsTeeMark || shotPlanOpen || pendingTap) return;
    if (distanceMode && tapPoint) return;
    if (liveGreenYds) {
      setTargetYards(Math.round(liveGreenYds.center / 5) * 5);
    }
  }, [
    liveGreenYds?.center,
    needsTeeMark,
    activeHole,
    shotPlanOpen,
    distanceMode,
    pendingTap,
    tapPoint,
    teeMark,
  ]);

  // Demo en casa: posición simulada tee→green (sin GPS ni límite de 300 m).
  useEffect(() => {
    if (!demoMode) return;
    const hp = activeHolePoints;
    if (!hp?.tee || !hp.center) {
      setGeo({ status: "requesting" });
      return;
    }
    const f = Math.max(0, Math.min(1, demoProgress)) * 0.92;
    setGeo({
      status: "ok",
      lat: hp.tee.lat + (hp.center.lat - hp.tee.lat) * f,
      lon: hp.tee.lon + (hp.center.lon - hp.tee.lon) * f,
      accuracy: 5,
      ts: Date.now(),
    });
  }, [demoMode, activeHolePoints, demoProgress]);

  const greenYds = useMemo(() => {
    if (!activeHolePoints) return null;
    if (needsTeeMark && catalogTeeForHole) {
      return greenDistancesForHole(
        catalogTeeForHole.lat,
        catalogTeeForHole.lon,
        activeHolePoints
      );
    }
    if (lastBall) {
      return greenDistancesForHole(
        lastBall.lat,
        lastBall.lon,
        activeHolePoints
      );
    }
    if (teeMark) {
      return greenDistancesForHole(
        teeMark.lat,
        teeMark.lon,
        activeHolePoints
      );
    }
    if (geo.status !== "ok") return null;
    return greenDistancesForHole(geo.lat, geo.lon, activeHolePoints);
  }, [geo, activeHolePoints, lastBall, teeMark, needsTeeMark, catalogTeeForHole]);

  const refPoints = useMemo(() => {
    if (!activeHolePoints) return [];
    const origin =
      needsTeeMark && catalogTeeForHole
        ? catalogTeeForHole
        : geo.status === "ok"
          ? { lat: geo.lat, lon: geo.lon }
          : null;
    if (!origin) return [];
    return referenceDistancesForHole(
      origin.lat,
      origin.lon,
      activeHolePoints,
      customPoints
    );
  }, [geo, activeHolePoints, customPoints, needsTeeMark, catalogTeeForHole]);

  const playFromPoint = useMemo(() => {
    for (let i = shotsOnHole.length - 1; i >= 0; i--) {
      const s = shotsOnHole[i];
      if (s.completedAt != null && s.to) return s.to;
    }
    return teeMark;
  }, [shotsOnHole, teeMark]);

  const holeMeta = activeHolePoints;

  const onMapTap = useCallback(
    (lat: number, lon: number) => {
      if (geo.status !== "ok" || !activeHolePoints) return;
      if (holeFinishPrompt) return;

      if (needsTeeMark || canAdjustTee) {
        markTeeAt(lat, lon);
        return;
      }

      if (shotPlanOpen && !pendingShot) return;

      if (pendingShot) {
        if (!hasTeeMark) {
          setArrivalToast("Marca tu salida antes de registrar un golpe");
          return;
        }
        const actual = Math.round(
          yardsBetween(pendingShot.from.lat, pendingShot.from.lon, lat, lon) / 5
        ) * 5;
        const lie = detectLieForPoint(lat, lon);
        let next = completeShotArrival(
          holeShotsStore,
          activeHole,
          pendingShot.id,
          { lat, lon },
          actual,
          lie.kind
        );
        setPendingTap(null);
        setDistanceMode(false);
        setMeasureFromPhoneOnce(false);
        setTapPoint(null);

        if (lie.kind === "ob") {
          const replayFrom = {
            lat: pendingShot.from.lat,
            lon: pendingShot.from.lon,
          };
          pinMapFraming(replayFrom);
          const penalized = ensureObPenaltyStroke(
            next,
            activeHole,
            pendingShot.id,
            replayFrom
          );
          next = penalized.store;
          const strokeCount = completedStrokeCount(next, activeHole);
          setHoleShotsStore(next);
          saveHoleShots(next, bagScope);
          setArrivalToast(
            `OB · golpe ${pendingShot.strokeNo} + castigo (+1) = ${strokeCount} golpes · vuelves a jugar desde donde estabas`
          );
          openPlanFromPoint(replayFrom.lat, replayFrom.lon);
          return;
        }

        const toGreen = greenDistancesForHole(lat, lon, activeHolePoints);
        setHoleShotsStore(next);
        saveHoleShots(next, bagScope);

        if (
          shouldPromptHoleFinish(toGreen.center, pendingShot, lie.kind)
        ) {
          const strokeCount = shotsForHole(next, activeHole).filter(
            (s) => s.completedAt != null
          ).length;
          pinMapFraming({ lat, lon });
          showHoleFinishPrompt(
            lat,
            lon,
            strokeCount,
            toGreen.center,
            lieArrivalPhrase(lie.kind)
          );
          return;
        }

        setArrivalToast(
          `Golpe ${pendingShot.strokeNo}: ${actual} yds · ${lieArrivalPhrase(lie.kind)} · al green ${toGreen.center}`
        );
        pinMapFraming({ lat, lon });
        openPlanFromPoint(lat, lon);
        return;
      }

      setPendingTap({ lat, lon });
      setShotPlanOpen(false);
      setDistanceMode(false);
      setTapPoint(null);
      setTargetYards(0);
    },
    [
      geo,
      activeHolePoints,
      needsTeeMark,
      canAdjustTee,
      hasTeeMark,
      markTeeAt,
      shotPlanOpen,
      pendingShot,
      holeShotsStore,
      activeHole,
      bagScope,
      openPlanFromPoint,
      resetTapUi,
      insideHole,
      demoMode,
      holeFinishPrompt,
      detectLieForPoint,
      showHoleFinishPrompt,
      pinMapFraming,
    ]
  );

  const handleChooseDistance = useCallback(() => {
    if (!pendingTap || geo.status !== "ok" || !activeHolePoints || !measureAnchor)
      return;
    const yards = yardsBetween(
      measureAnchor.lat,
      measureAnchor.lon,
      pendingTap.lat,
      pendingTap.lon
    );
    const toGreen = greenDistancesForHole(
      pendingTap.lat,
      pendingTap.lon,
      activeHolePoints
    );
    setTapPoint({
      lat: pendingTap.lat,
      lon: pendingTap.lon,
      yards,
    });
    setTargetYards(Math.round(toGreen.center / 5) * 5);
    setDistanceMode(true);
    setPendingTap(null);
    setMeasureFromPhoneOnce(false);
  }, [pendingTap, geo, activeHolePoints, measureAnchor]);

  const handleChooseShot = useCallback(() => {
    if (!hasTeeMark) {
      setArrivalToast("Marca tu salida en este hoyo primero");
      setPendingTap(null);
      return;
    }
    if (pendingTap) {
      pinMapFraming(pendingTap);
      openPlanFromPoint(pendingTap.lat, pendingTap.lon);
    } else if (playFromPoint) {
      pinMapFraming(playFromPoint);
      openPlanFromPoint(playFromPoint.lat, playFromPoint.lon);
    }
    setPendingTap(null);
  }, [hasTeeMark, pendingTap, playFromPoint, openPlanFromPoint, pinMapFraming]);

  const handleConfirmPlan = useCallback(
    (plan: {
      catalogId: string;
      swing: SwingKind;
      plannedYards: number;
    }) => {
      if (!teeMark || !activeHolePoints) {
        setArrivalToast("Marca tu salida antes de planear un golpe");
        setShotPlanOpen(false);
        return;
      }
      const from =
        lastBallPosition(holeShotsStore, activeHole, catalogTeeForHole) ??
        teeMark;
      const fromDist = greenDistancesForHole(
        from.lat,
        from.lon,
        activeHolePoints
      );
      const lieFrom = detectLieForPoint(from.lat, from.lon);
      const onGreenFrom = lieFrom.onGreen;

      const { store, shot } = addPlannedShot(
        holeShotsStore,
        activeHole,
        from,
        plan.catalogId,
        plan.swing,
        plan.plannedYards
      );

      if (
        isTapInPutt(
          fromDist.center,
          plan.catalogId,
          plan.plannedYards,
          onGreenFrom
        )
      ) {
        setHoleShotsStore(store);
        saveHoleShots(store, bagScope);
        setShotPlanOpen(false);
        setPlanContext(null);
        pinMapFraming(from);
        const strokeCount = shotsForHole(store, activeHole).filter(
          (s) => s.completedAt != null
        ).length;
        showHoleFinishPrompt(
          from.lat,
          from.lon,
          strokeCount,
          fromDist.center,
          "en el green"
        );
        return;
      }

      setHoleShotsStore(store);
      saveHoleShots(store, bagScope);
      setShotPlanOpen(false);
      setPlanContext(null);
      pinMapFraming(from);
      setArrivalToast("Toca en el mapa donde quedó la bola");
    },
    [
      teeMark,
      activeHolePoints,
      holeShotsStore,
      activeHole,
      bagScope,
      catalogTeeForHole,
      detectLieForPoint,
      greenPolygonsByHole,
      showHoleFinishPrompt,
      pinMapFraming,
    ]
  );

  const measureFromPhoneNow = useCallback(() => {
    if (geo.status !== "ok" || !tapPoint) return;
    setMeasureFromPhoneOnce(true);
    setTapPoint({
      ...tapPoint,
      yards: yardsBetween(geo.lat, geo.lon, tapPoint.lat, tapPoint.lon),
    });
  }, [geo, tapPoint]);

  const clearTap = useCallback(() => {
    setTapPoint(null);
    setTargetYards(0);
    resetTapUi();
  }, [resetTapUi]);

  const handleBagChange = useCallback(
    (next: PlayerBag) => {
      setBag(next);
      savePlayerBag(next, bagScope);
    },
    [bagScope]
  );

  // Semáforo de ritmo: solo si la URL trae identidad (me / caddie / tg).
  useEffect(() => {
    if (!actorQuery) {
      setPace(null);
      return;
    }
    let cancelled = false;
    const fetchPace = async () => {
      try {
        const holeParam =
          activeHole >= 1 && activeHole <= 18 ? `&hole=${activeHole}` : "";
        const res = await fetch(
          `/api/captura/distancias/pace?${actorQuery}${holeParam}`
        );
        const data = (await res.json()) as PaceState;
        if (cancelled) return;
        if (data && data.ok) setPace(data);
        else setPace(null);
      } catch {
        if (!cancelled) setPace(null);
      }
    };
    fetchPace();
    const interval = setInterval(fetchPace, 60_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [actorQuery, activeHole]);

  const goToHole = useCallback(
    (delta: 1 | -1) => {
      manualAtDetectedRef.current = insideHole;
      setManualHole((prev) => {
        const base = prev ?? autoHole ?? nearestHole;
        if (delta === 1) return (base % 18) + 1;
        return base <= 1 ? 18 : base - 1;
      });
      setTapPoint(null);
      setTargetYards(0);
      resetTapUi();
      if (demoMode) setDemoProgress(0.35);
    },
    [insideHole, autoHole, nearestHole, resetTapUi, demoMode]
  );

  const prevHole = useCallback(() => goToHole(-1), [goToHole]);
  const nextHole = useCallback(() => goToHole(1), [goToHole]);

  const resetHoleFromScratch = useCallback(
    (hole: number) => {
      const next = clearHoleShots(holeShotsStore, hole);
      setHoleShotsStore(next);
      saveHoleShots(next, bagScope);
      setTapPoint(null);
      setTargetYards(0);
      resetTapUi();
      setShotsDetailOpen(false);
      setMapFramingLock(null);
    },
    [holeShotsStore, bagScope, resetTapUi]
  );

  const startAtHole = useCallback(
    (n: number) => {
      manualAtDetectedRef.current = insideHole;
      autoCandidateRef.current = { hole: 0, count: 0 };
      resetHoleFromScratch(n);
      setManualHole(n);
      setArrivalToast(null);
      if (demoMode) setDemoProgress(0.35);
    },
    [insideHole, resetHoleFromScratch, demoMode]
  );

  const resetActiveHole = useCallback(() => {
    resetHoleFromScratch(activeHole);
    setArrivalToast(`Hoyo ${activeHole} reiniciado · marca salida`);
  }, [activeHole, resetHoleFromScratch]);

  const teeMarkBannerLine =
    arrivalToast &&
    (arrivalToast.includes("terminado") ||
      arrivalToast.includes("Pasa al hoyo") ||
      arrivalToast.includes("reiniciado"))
      ? arrivalToast
      : `Hoyo ${activeHole} · marca tu salida`;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-slate-100">
      {/* Mapa a pantalla completa */}
      <div className="absolute inset-0">
        {geo.status === "ok" && greenYds && !farFromCourse ? (
          <HoleYardageMap
            key={`yardage-h${activeHole}-e${mapFrameEpoch}`}
            holeNo={activeHole}
            par={holeMeta?.par ?? 4}
            playerLat={geo.lat}
            playerLon={geo.lon}
            yardsToCenter={greenYds.center}
            referencePoints={refPoints}
            holeBoundary={boundaryByHole.get(activeHole) ?? null}
            centerline={centerlines[activeHole] ?? null}
            tapPoint={tapPoint}
            pendingTapPoint={pendingTap}
            onMapTap={onMapTap}
            lineFromLat={
              tapPoint && measureAnchor ? measureAnchor.lat : undefined
            }
            lineFromLon={
              tapPoint && measureAnchor ? measureAnchor.lon : undefined
            }
            teeMarkPoint={teeMark}
            needsTeeMark={needsTeeMark}
            teeAdjustMode={canAdjustTee}
            shotLandings={shotLandings}
            playBallPoint={playBallPoint}
            mapFramingPoint={mapFramingPoint}
            catalogTeePoint={
              (needsTeeMark || canAdjustTee) && catalogTeeForHole
                ? catalogTeeForHole
                : null
            }
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-900 px-6 text-center text-sm text-slate-300">
            {geo.status === "denied" || geo.status === "error"
              ? `⚠ ${geo.message}`
              : "📡 Esperando GPS…"}
          </div>
        )}
      </div>

      {/* Solo una ✕ para cerrar, en la esquina superior derecha (no tapa el
          green, que ahora va arriba al centro). */}
      <Link
        href="/"
        aria-label="Cerrar"
        className="absolute right-2 top-2 z-[1000] flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/55 text-base font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
      >
        ✕
      </Link>

      <button
        type="button"
        onClick={() => setBagOpen(true)}
        className={[
          "absolute left-2 z-[1000] rounded-full border border-white/30 bg-black/55 px-2.5 py-1.5 text-[11px] font-black text-emerald-200 shadow-lg backdrop-blur-sm active:scale-95",
          demoMode ? "top-11" : "top-2",
        ].join(" ")}
      >
        Bolsa
      </button>

      {demoMode ? (
        <div className="pointer-events-none absolute left-2 top-2 z-[1000] max-w-[70%] rounded-full bg-amber-500/95 px-2.5 py-1 text-[10px] font-black leading-tight text-amber-950 shadow-lg">
          DEMO · en casa · sin GPS
        </div>
      ) : null}

      <PlayerBagSheet
        open={bagOpen}
        bag={bag}
        onChange={handleBagChange}
        onClose={() => {
          savePlayerBag(bag, bagScope);
          setBagOpen(false);
        }}
      />

      <HoleShotsDetailSheet
        open={shotsDetailOpen}
        hole={activeHole}
        store={holeShotsStore}
        onClose={() => setShotsDetailOpen(false)}
        onCorrectLanding={(shotId) => correctLastShotLanding(shotId)}
      />

      {needsTeeMark && !farFromCourse ? (
        <div className="pointer-events-none absolute inset-x-2 top-12 z-[1065] rounded-xl border border-emerald-400/50 bg-emerald-950/95 px-3 py-2 shadow-xl backdrop-blur-md">
          <p className="text-center text-[11px] font-black text-emerald-100">
            {teeMarkBannerLine}
          </p>
          <p className="mt-0.5 text-center text-[10px] text-emerald-200/85">
            Marca tu salida · toca el tee en el mapa para confirmar
          </p>
        </div>
      ) : null}

      {pendingTap && !farFromCourse && !needsTeeMark ? (
        <div className="pointer-events-none absolute inset-x-0 top-[38%] z-[1055] flex justify-center px-4">
          <div className="pointer-events-auto rounded-xl border border-white/20 bg-black/80 px-3 py-2 shadow-2xl backdrop-blur-md">
            <p className="mb-1.5 text-center text-[10px] font-semibold text-slate-300">
              ¿Qué quieres hacer?
            </p>
            <MapTapActions
              onDistance={handleChooseDistance}
              onShot={handleChooseShot}
              onCancel={() => setPendingTap(null)}
            />
          </div>
        </div>
      ) : null}

      {holeFinishPrompt && !farFromCourse ? (
        <div className="pointer-events-none absolute inset-x-0 top-[28%] z-[1095] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-xl border-2 border-emerald-400/60 bg-emerald-950/98 px-4 py-3 shadow-2xl backdrop-blur-md">
            <p className="text-center text-xs font-black text-emerald-50">
              Hoyo {holeFinishPrompt.hole} · {holeFinishPrompt.strokeCount}{" "}
              golpe{holeFinishPrompt.strokeCount === 1 ? "" : "s"}
            </p>
            <p className="mt-1 text-center text-[11px] font-semibold text-emerald-200">
              Estás a menos de 1 yd · ¿entró al hoyo?
            </p>
            <div className="mt-2.5 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => finishHoleAndAdvance("in")}
                className="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white active:scale-[0.98]"
              >
                Sí, entró
              </button>
              <button
                type="button"
                onClick={() => finishHoleAndAdvance("given")}
                className="rounded-lg border border-emerald-400/50 bg-emerald-900/80 px-3 py-2.5 text-xs font-black text-emerald-100 active:scale-[0.98]"
              >
                Quedó dada
              </button>
              <button
                type="button"
                onClick={continueHoleAfterMiss}
                className="rounded-lg border border-amber-500/40 bg-amber-950/80 px-3 py-2 text-[11px] font-bold text-amber-200 active:scale-[0.98]"
              >
                No entró · sigo jugando
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Controles abajo: selector de hoyo + distancias al green. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex flex-col items-stretch">
        {arrivalToast && !needsTeeMark ? (
          <div
            className={[
              "pointer-events-none mx-2 mb-1 rounded-lg px-3 py-1.5 text-center text-[11px] font-semibold shadow-lg",
              arrivalToast.includes("OB ·")
                ? "border border-red-500/50 bg-red-950/95 text-red-100"
                : "bg-emerald-900/90 text-emerald-100",
            ].join(" ")}
          >
            {arrivalToast}
          </div>
        ) : null}
        {pendingShot && !pendingTap && !shotPlanOpen && hasTeeMark ? (
          <div className="pointer-events-auto mx-2 mb-1 flex flex-col items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-950/90 px-3 py-1.5 shadow-lg">
            {currentBallLie ? (
              <LieChip kind={currentBallLie.kind} size="sm" />
            ) : null}
            <div className="flex items-center justify-center gap-2">
              <span className="text-[11px] font-bold text-amber-200">
                Golpe {pendingShot.strokeNo} · toca donde quedó la bola
              </span>
              <button
                type="button"
                onClick={() => {
                  const next = cancelPendingShot(
                    holeShotsStore,
                    activeHole,
                    pendingShot.id
                  );
                  setHoleShotsStore(next);
                  saveHoleShots(next, bagScope);
                  setArrivalToast("Golpe cancelado");
                }}
                className="rounded bg-amber-900/80 px-1.5 py-0.5 text-[9px] font-bold text-amber-100"
              >
                Cancelar golpe
              </button>
            </div>
          </div>
        ) : null}
        {hasTeeMark &&
        !pendingShot &&
        !shotPlanOpen &&
        currentBallLie &&
        !farFromCourse ? (
          <div className="pointer-events-none mx-2 mb-1 flex justify-center">
            <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-black/80 px-2.5 py-1 shadow-lg backdrop-blur-md">
              <span className="text-[9px] font-semibold text-slate-400">
                Lie
              </span>
              <LieChip kind={currentBallLie.kind} size="sm" />
            </div>
          </div>
        ) : null}
        {distanceMode &&
        tapPoint &&
        hasLoggedShotsOnHole(holeShotsStore, activeHole) &&
        !farFromCourse ? (
          <div className="pointer-events-auto mb-1 flex justify-center">
            <button
              type="button"
              onClick={measureFromPhoneNow}
              className="rounded-full border border-sky-500/50 bg-sky-950/80 px-2.5 py-0.5 text-[10px] font-bold text-sky-200 shadow active:scale-95"
            >
              📍 Medir desde teléfono
            </button>
          </div>
        ) : null}
        <div className="pointer-events-none flex items-center justify-between gap-1.5 px-2 pb-2">
          <div className="pointer-events-auto flex items-center gap-1.5">
            {/* Comenzar la vuelta en la salida del 1 o del 10. */}
            <div className="flex flex-col gap-0.5">
              <button
                type="button"
                onClick={() => startAtHole(1)}
                aria-label="Comenzar en el hoyo 1"
                className={[
                  "rounded-md border px-2 py-0.5 text-[10px] font-black leading-tight shadow-lg backdrop-blur-sm active:scale-95",
                  activeHole === 1
                    ? "border-amber-300 bg-amber-500 text-black"
                    : "border-white/30 bg-black/60 text-amber-100",
                ].join(" ")}
              >
                Salir 1
              </button>
              <button
                type="button"
                onClick={() => startAtHole(10)}
                aria-label="Comenzar en el hoyo 10"
                className={[
                  "rounded-md border px-2 py-0.5 text-[10px] font-black leading-tight shadow-lg backdrop-blur-sm active:scale-95",
                  activeHole === 10
                    ? "border-amber-300 bg-amber-500 text-black"
                    : "border-white/30 bg-black/60 text-amber-100",
                ].join(" ")}
              >
                Salir 10
              </button>
            </div>
            <button
              type="button"
              onClick={prevHole}
              aria-label="Hoyo anterior"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
            >
              ‹
            </button>
            <div
              className="rounded-md bg-black/60 px-2 py-0.5 text-center leading-none shadow-lg backdrop-blur-sm"
              aria-live="polite"
            >
              <div className="text-xs font-black text-emerald-100">
                H{activeHole}
                <span className="ml-1 text-[9px] font-semibold text-slate-300">
                  par {holeMeta?.par ?? "—"}
                </span>
              </div>
              {hasTeeMark ? (
                <div className="text-[8px] text-emerald-400/90">salida ✓</div>
              ) : (
                <div className="text-[8px] text-amber-300/90">marca salida</div>
              )}
            </div>
            <button
              type="button"
              onClick={nextHole}
              aria-label="Hoyo siguiente"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
            >
              ›
            </button>
            <button
              type="button"
              onClick={resetActiveHole}
              aria-label="Reiniciar hoyo desde cero"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/25 bg-black/60 text-base font-bold leading-none text-slate-200 shadow-lg backdrop-blur-sm active:scale-95"
              title="Reiniciar hoyo"
            >
              ↺
            </button>
            {(completedShotsCount > 0 || pendingShot) && !farFromCourse ? (
              <button
                type="button"
                onClick={() => setShotsDetailOpen((o) => !o)}
                className="rounded-md border border-white/25 bg-black/60 px-2 py-1 text-[10px] font-black text-amber-200 shadow-lg backdrop-blur-sm active:scale-95"
              >
                Golpes
                <span className="ml-0.5 text-emerald-300">
                  {completedShotsCount}
                  {pendingShot ? "+" : ""}
                </span>
              </button>
            ) : null}
          </div>

          {greenYds ? (
            <div className="pointer-events-none flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 backdrop-blur-sm">
              <MiniDist label="Ent" yards={greenYds.front} />
              <MiniDist label="Cen" yards={greenYds.center} highlight />
              <MiniDist label="Fon" yards={greenYds.back} />
            </div>
          ) : (
            <span />
          )}
        </div>

        {/* Barra de ritmo delgada, pegada al borde inferior */}
        {!farFromCourse ? <PaceBannerThin pace={demoMode ? null : pace} /> : null}
        {demoMode ? (
          <div className="pointer-events-auto mx-2 mb-1 rounded-lg bg-black/75 px-3 py-2 backdrop-blur-sm">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-300">
              <span>Tee</span>
              <span>Simular posición ({Math.round(demoProgress * 100)}%)</span>
              <span>Green</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(demoProgress * 100)}
              onChange={(e) => setDemoProgress(Number(e.target.value) / 100)}
              className="w-full accent-emerald-500"
            />
          </div>
        ) : null}
      </div>

      {shotPlanOpen && planContext && !farFromCourse && hasTeeMark ? (
        <ShotPlanPanel
          key={`plan-${activeHole}-${planSession}-${planContext.yardsToGreen}-${planContext.lieKind}`}
          bag={bag}
          yardsToGreen={planContext.yardsToGreen}
          greenDist={planContext.greenDist}
          lieKind={planContext.lieKind}
          onGreen={planContext.onGreen}
          inBunker={planContext.inBunker}
          onConfirm={handleConfirmPlan}
          onCancel={() => {
            setShotPlanOpen(false);
            setPlanContext(null);
          }}
          onCorrectLastLanding={
            lastCompletedShotOnHole && !pendingShot
              ? () => correctLastShotLanding()
              : undefined
          }
        />
      ) : null}

      {topGreenYds && !farFromCourse && !needsTeeMark ? (
        <MapFocusTopBar
          demoMode={demoMode}
          greenCenterYards={topGreenYds.center}
          positionLabel={topGreenLabel}
          lieKind={currentBallLie?.kind ?? null}
          onGreen={currentBallLie?.onGreen ?? false}
        />
      ) : null}

      {/* Fuera del rango del club */}
      {farFromCourse ? (
        <div className="absolute inset-0 z-[1100] flex flex-col items-center justify-center bg-slate-950/92 px-6 text-center">
          <div className="text-5xl">📍</div>
          <h2 className="mt-3 text-lg font-bold text-amber-200">
            Estás lejos del campo
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            El medidor de yardas solo funciona en el club o el fraccionamiento
            (a menos de {MAX_DISTANCE_FROM_COURSE_M} m del hoyo más cercano).
          </p>
          {nearest ? (
            <p className="mt-2 text-xs text-slate-500">
              Estás a ~{Math.round(nearest.distanceMeters)} m del green más
              cercano (hoyo {nearest.holeNo}).
            </p>
          ) : null}
          <Link
            href="/"
            className="mt-5 rounded-md border border-slate-600 px-4 py-2 text-sm font-semibold text-slate-200"
          >
            Cerrar
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function PaceBannerThin({ pace }: { pace: PaceState | null }) {
  if (!pace) return null;
  const hasDelta = pace.color !== "none" && pace.deltaMinutes != null;
  const hasWindow = Boolean(pace.windowStart && pace.windowEnd);
  if (!hasDelta && !hasWindow) return null;

  // Si no hay semáforo (solo ventana de horario), usamos un estilo neutro.
  const style = hasDelta
    ? PACE_STYLE[pace.color as Exclude<PaceColor, "none">]
    : { box: "border-slate-500 bg-slate-800", title: "RITMO", label: "text-slate-100" };

  const mins = hasDelta ? Math.abs(Math.round(pace.deltaMinutes as number)) : 0;
  const detail = hasDelta
    ? pace.color === "blue"
      ? `${mins} min más rápido`
      : pace.color === "green"
        ? `±${mins} min · vas bien`
        : `${mins} min más lento`
    : "";

  return (
    <div
      className={[
        "pointer-events-none flex flex-col items-center justify-center border-t-2 px-3 py-1 text-center shadow-lg",
        style.box,
      ].join(" ")}
    >
      <div className="flex items-center justify-center gap-2">
        <span
          className={[
            "text-base font-black tracking-wide",
            style.label,
          ].join(" ")}
        >
          {style.title}
        </span>
        {detail ? (
          <span className={["text-xs font-bold", style.label].join(" ")}>
            · {detail}
          </span>
        ) : null}
      </div>
      {hasWindow ? (
        <span
          className={[
            "text-[11px] font-semibold leading-tight",
            style.label,
          ].join(" ")}
        >
          {pace.hoyo ? `Hoyo ${pace.hoyo}` : "Este hoyo"} ideal:{" "}
          {pace.windowStart}–{pace.windowEnd}
        </span>
      ) : null}
    </div>
  );
}

function MiniDist({
  label,
  yards,
  highlight,
}: {
  label: string;
  yards: number;
  highlight?: boolean;
}) {
  return (
    <div className="px-1 text-center leading-none">
      <div
        className={[
          "text-[7px] font-bold uppercase",
          highlight ? "text-emerald-300" : "text-slate-300",
        ].join(" ")}
      >
        {label}
      </div>
      <div
        className={[
          "text-sm font-black",
          highlight ? "text-emerald-100" : "text-white",
        ].join(" ")}
      >
        {yards}
      </div>
    </div>
  );
}
