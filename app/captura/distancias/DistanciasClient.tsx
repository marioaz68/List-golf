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
import {
  loadPlayingTeeCode,
  savePlayingTeeCode,
} from "@/lib/distances/playerTeeSet";
import type { ShotPreview } from "@/lib/distances/shotTrajectory";
import {
  CCQ_CALIBRATION_TEE_SETS,
  resolveTeePosition,
  teeSetLabel,
  type TeePositionsByCode,
  type TeeSetCode,
} from "@/lib/distances/teePositions";
import { parsePolygonsFromApi } from "@/lib/distances/holeBoundary";
import {
  activeHoleInBoundsRefs,
  detectLieAtPoint,
  lieArrivalPhrase,
  type LieKind,
} from "@/lib/distances/detectLie";
import {
  ballAtPuttYardsFromHole,
  isTapInPutt,
  holedPinPosition,
  puttDistanceToHole,
  puttYardsFromCenter,
  shouldPromptHoleFinish,
  snapLandingToGreenCenter,
  strokeActualYards,
} from "@/lib/distances/holeComplete";
import {
  buildCourseHolesCollection,
  parseBoundariesPayload,
} from "@/lib/distances/resolveCourseHoles";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import type { FeatureCollection, Polygon } from "@/lib/telegram/ritmo/geometry";
import type { TapPoint } from "@/components/captura/HoleYardageMap";
import { HoleShotsDetailSheet } from "@/components/captura/HoleShotsDetailSheet";
import { GreenPuttDistancePanel } from "@/components/captura/GreenPuttDistancePanel";
import { LieChip } from "@/components/captura/LieChip";
import { MapTapActions } from "@/components/captura/MapTapActions";
import { FlagPositionSheet } from "@/components/captura/FlagPositionSheet";
import { PlayerBagSheet } from "@/components/captura/PlayerBagSheet";
import {
  YardageStatsSheet,
  YardageStatsSummaryCompact,
} from "@/components/captura/YardageStatsSheet";
import { RoundTeePickerOverlay } from "@/components/captura/RoundTeePickerOverlay";
import { computeRoundYardageStats } from "@/lib/distances/yardageStats";
import { ShotPlanPanel } from "@/components/captura/ShotPlanPanel";
import type { SwingKind } from "@/lib/distances/clubCatalog";
import {
  configurePlayerBagSync,
  defaultPlayerBag,
  loadPlayerBag,
  loadPlayerBagRemote,
  retryPendingPlayerBagSync,
  savePlayerBag,
  type PlayerBag,
  type PlayerBagSyncContext,
} from "@/lib/distances/playerBag";
import {
  isShortGameDistance,
  yardsToGreenCenterRounded,
  type GreenDistances,
} from "@/lib/distances/suggestClub";
import {
  addPlannedShot,
  addManualPenaltyStroke,
  completedStrokeCount,
  cancelPendingShot,
  ensureObPenaltyStroke,
  ensureWaterPenaltyStroke,
  clearHoleShots,
  completeShotArrival,
  finishPromptStrokeCount,
  hasRemovableShotsOnHole,
  hasHoleTeeMark,
  hasLoggedShotsOnHole,
  holeTeeMark,
  lastBallPosition,
  lastCompletedShot,
  inferRoundStartHole,
  isRoundFinishingHole,
  loadHoleShots,
  penaltyReasonLabel,
  playHeadHoleFromStore,
  pendingShotOnHole,
  pendingWaterDropOnHole,
  recordGivenPutt,
  recordHoledPutt,
  removeLastShotOnHole,
  relocateBallOnGreen,
  resetShotArrival,
  roundNineLabel,
  roundStrokeTotals,
  saveHoleShots,
  setHoleTeeMark,
  setWaterPenaltyDrop,
  shotsForHole,
  type HoleShotsStore,
  type ManualPenaltyReason,
  type RoundStrokeTotals,
  withRoundStartHole,
} from "@/lib/distances/holeShots";
import {
  configureHoleShotsSync,
  loadHoleShotsMerged,
  type HoleShotsSyncContext,
} from "@/lib/distances/syncHoleShotsRemote";

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
const GREEN_ENTRY_DWELL_MS = 4000;
const GREEN_PUTT_MAX_YARDS = 35;

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

interface GreenEntryPuttPrompt {
  hole: number;
  detectedAt: number;
  entryLat: number;
  entryLon: number;
  pendingShotId: string | null;
  puttCount: number;
  puttYards: number[];
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

export default function DistanciasClient({
  demoMode: demoModeProp = false,
}: {
  demoMode?: boolean;
}) {
  const searchParams = useSearchParams();
  const demoMode =
    demoModeProp || searchParams.get("prueba") === "1";

  const pruebaHref = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("prueba", "1");
    return `/captura/distancias?${p.toString()}`;
  }, [searchParams]);

  const [geo, setGeo] = useState<GeoState>(
    demoMode ? { status: "idle" } : { status: "idle" }
  );
  const [manualHole, setManualHole] = useState<number | null>(demoMode ? 1 : null);
  /** En demo: 0 = tee, 1 = casi en el green (simula caminar el hoyo). */
  const [demoProgress, setDemoProgress] = useState(0.35);
  const [tapPoint, setTapPoint] = useState<TapPoint | null>(null);
  /** Yardas al centro del green desde el punto tocado (objetivo de golpe). */
  const [targetYards, setTargetYards] = useState(0);
  /** true si el objetivo del hoyo activo es la bandera del día (no el centro). */
  const [pinFromFlag, setPinFromFlag] = useState(false);
  /** Hoja con la posición de la bandera del hoyo (referencia para el jugador). */
  const [flagSheetOpen, setFlagSheetOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [bag, setBag] = useState<PlayerBag>(() => defaultPlayerBag());
  const bagRef = useRef<PlayerBag>(bag);
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
  const [shotPreview, setShotPreview] = useState<ShotPreview | null>(null);
  const [shotsDetailOpen, setShotsDetailOpen] = useState(false);
  const [measureFromPhoneOnce, setMeasureFromPhoneOnce] = useState(false);
  const [distanceMode, setDistanceMode] = useState(false);
  const [arrivalToast, setArrivalToast] = useState<string | null>(null);
  const [waterDropError, setWaterDropError] = useState<string | null>(null);
  /** Tras caída a ~0 yds: confirmar si el hoyo terminó o sigue jugando. */
  const [holeFinishPrompt, setHoleFinishPrompt] = useState<{
    lat: number;
    lon: number;
    strokeCount: number;
    hole: number;
    centerYards: number;
  } | null>(null);
  /** Tras tocar el green: ajustar yardas al hoyo sobre la línea marcada. */
  const [greenPuttAdjust, setGreenPuttAdjust] = useState<{
    markLat: number;
    markLon: number;
    measuredYards: number;
    puttYards: number;
    mode: "landing" | "relocate";
  } | null>(null);
  const [greenEntryPuttPrompt, setGreenEntryPuttPrompt] =
    useState<GreenEntryPuttPrompt | null>(null);
  /** Fuerza remount/reencuadre del mapa al cambiar de hoyo. */
  const [mapFrameEpoch, setMapFrameEpoch] = useState(0);
  /** Tras OB: fija foto en el tramo donde pegaste, no en la salida ni en el OB. */
  const [mapFramingLock, setMapFramingLock] = useState<{
    lat: number;
    lon: number;
    segmentIdx: number;
  } | null>(null);
  /** Hoyo donde seguías jugando antes de regresar con las flechas. */
  const [resumeHole, setResumeHole] = useState<number | null>(null);
  /** true una vez que se cargaron los golpes guardados desde bagScope. Evita
   *  que el menú de salida se abra por un instante antes de recuperar la ronda. */
  const [shotsHydrated, setShotsHydrated] = useState(false);
  /** Modo corrección: quitar golpes con ✕ y re-anotar el hoyo. */
  const [holeCorrectionMode, setHoleCorrectionMode] = useState(false);
  /** Resumen al terminar la ronda (18 hoyos). */
  const [roundSummary, setRoundSummary] = useState<RoundStrokeTotals | null>(
    null
  );
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
  const [teePositionsByCode, setTeePositionsByCode] =
    useState<TeePositionsByCode>({});
  const [playingTeeCode, setPlayingTeeCode] = useState<TeeSetCode>("BLK");
  const [showRoundTeePicker, setShowRoundTeePicker] = useState(false);
  const [roundTeeConfirmed, setRoundTeeConfirmed] = useState(false);
  /** Hoyo de salida elegido en el menú (1 o 10). */
  const [roundStartHole, setRoundStartHole] = useState<number | null>(null);
  // Salidas por hoyo del set activo (calibradas o default del catálogo).
  const teeCenters = useMemo<TeesByHole>(() => {
    const out: TeesByHole = {};
    for (let h = 1; h <= 18; h++) {
      const tee = resolveTeePosition(h, playingTeeCode, teePositionsByCode);
      if (tee) out[h] = tee;
    }
    return out;
  }, [playingTeeCode, teePositionsByCode]);
  const watchIdRef = useRef<number | null>(null);
  const greenEntryInsideSinceRef = useRef<number | null>(null);
  const greenEntryPromptedHoleRef = useRef<number | null>(null);
  const greenEntrySuppressUntilRef = useRef(0);
  // Última posición aceptada. Sirve para ignorar el micro-jitter del GPS
  // (cambios de 1-2 m cada segundo aunque estés parado) que hacía parpadear y
  // re-encuadrar el mapa constantemente.
  const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
  // Errores de GPS transitorios consecutivos (kCLErrorDomain / POSITION_UNAVAILABLE)
  // sin haber tenido posición aún. Solo mostramos error tras varios seguidos.
  const geoFailCountRef = useRef(0);
  // Hoyo detectado en el momento que el usuario fijó el hoyo a mano. Al entrar
  // a un hoyo distinto (el GPS detecta otro polígono), se reanuda el automático.
  const manualAtDetectedRef = useRef<number | null>(null);
  const autoPlanHoleRef = useRef<number | null>(null);
  const pendingHoleTeePlanRef = useRef<{
    hole: number;
    lat: number;
    lon: number;
  } | null>(null);

  const bagScope =
    searchParams.get("tg")?.trim() ||
    searchParams.get("me")?.trim() ||
    undefined;

  const parByHole = useMemo(() => {
    const out: Record<number, number> = {};
    for (let h = 1; h <= 18; h++) {
      out[h] = CCQ_HOLE_POINTS[h]?.par ?? 4;
    }
    return out;
  }, []);

  const roundYardageStats = useMemo(
    () => computeRoundYardageStats(holeShotsStore, parByHole),
    [holeShotsStore, parByHole]
  );

  useEffect(() => {
    setPlayingTeeCode(loadPlayingTeeCode(bagScope));
  }, [bagScope]);

  const shotsSyncCtx = useMemo((): HoleShotsSyncContext => {
    const entryId =
      searchParams.get("me")?.trim() ||
      searchParams.get("entry_id")?.trim() ||
      null;
    const caddieId =
      searchParams.get("caddie")?.trim() ||
      searchParams.get("caddie_id")?.trim() ||
      null;
    const telegramUserId = searchParams.get("tg")?.trim() || null;
    return {
      entryId,
      caddieId,
      telegramUserId,
      disabled: demoMode,
    };
  }, [searchParams, demoMode]);

  const bagSyncCtx = useMemo((): PlayerBagSyncContext => {
    const entryId =
      searchParams.get("me")?.trim() ||
      searchParams.get("entry_id")?.trim() ||
      null;
    const caddieId =
      searchParams.get("caddie")?.trim() ||
      searchParams.get("caddie_id")?.trim() ||
      null;
    const telegramUserId = searchParams.get("tg")?.trim() || null;
    return {
      entryId,
      caddieId,
      telegramUserId,
      disabled: demoMode,
    };
  }, [searchParams, demoMode]);

  useEffect(() => {
    configureHoleShotsSync(shotsSyncCtx);
  }, [shotsSyncCtx]);

  useEffect(() => {
    configurePlayerBagSync(bagSyncCtx);
  }, [bagSyncCtx]);

  useEffect(() => {
    if (demoMode) return;
    retryPendingPlayerBagSync();
    const handleOnline = () => retryPendingPlayerBagSync();
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [demoMode]);

  useEffect(() => {
    bagRef.current = bag;
  }, [bag]);

  useEffect(() => {
    setBag(loadPlayerBag(bagScope));
    if (!demoMode) {
      void loadPlayerBagRemote(bagScope, bagSyncCtx).then((remoteBag) => {
        if (remoteBag) {
          setBag(remoteBag);
          savePlayerBag(remoteBag, bagScope, bagSyncCtx);
        }
      });
    }
    const local = loadHoleShots(bagScope);
    setHoleShotsStore(local);
    setShotsHydrated(true);
    if (demoMode) return;
    let cancelled = false;
    void loadHoleShotsMerged(local, bagScope, shotsSyncCtx).then((merged) => {
      if (cancelled) return;
      setHoleShotsStore(merged);
      const head = playHeadHoleFromStore(merged);
      if (head != null) {
        setResumeHole((prev) => prev ?? head);
      }
      if (merged !== local) {
        saveHoleShots(merged, bagScope);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [bagScope, demoMode, bagSyncCtx, shotsSyncCtx]);

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
        geoFailCountRef.current = 0;
        setGeo({
          status: "ok",
          lat,
          lon,
          accuracy: pos.coords.accuracy ?? 0,
          ts: Date.now(),
        });
      },
      (err) => {
        // Permiso bloqueado: sí es un error de acción del usuario.
        if (err.code === 1) {
          setGeo({
            status: "denied",
            message:
              "Permiso de ubicación bloqueado. Habilita el GPS para esta página.",
          });
          return;
        }
        // Errores transitorios (código 2/3: kCLErrorDomain, sin señal, timeout).
        // Si ya teníamos una posición, la conservamos y seguimos intentando en
        // silencio (no rompemos el mapa). El watch se recupera solo.
        if (lastPosRef.current) return;
        // Aún sin posición: mostramos "esperando" y solo tras varios fallos
        // seguidos avisamos, en vez de soltar el error crudo de iOS.
        geoFailCountRef.current += 1;
        if (geoFailCountRef.current >= 5) {
          setGeo({
            status: "error",
            message:
              "No se pudo obtener el GPS. Revisa la señal y los permisos de ubicación.",
          });
        } else {
          setGeo({ status: "requesting" });
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
          tee_positions_by_code?: TeePositionsByCode;
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
        setTeePositionsByCode(data.tee_positions_by_code ?? {});
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
  /** True solo si el GPS te ubicó en el hoyo fijado a mano antes de avanzar. */
  const wasOnManualHoleRef = useRef(false);
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
    if (manualHole != null && insideHole === manualHole) {
      wasOnManualHoleRef.current = true;
    }
  }, [insideHole, manualHole]);

  useEffect(() => {
    if (manualHole == null || insideHole == null) return;
    const expectedNext = (manualHole % 18) + 1;
    if (insideHole !== expectedNext) return;
    // Si retrocediste con ‹ estando físicamente más adelante (p. ej. en el 18
    // mirando el 17), no interpretar el GPS como “avance” al hoyo siguiente.
    if (!wasOnManualHoleRef.current) return;
    wasOnManualHoleRef.current = false;
    setAutoHole(expectedNext);
    setManualHole(null);
    setTapPoint(null);
  }, [insideHole, manualHole]);

  const catalogTeeForHole = useMemo(
    () => resolveTeePosition(activeHole, playingTeeCode, teePositionsByCode),
    [activeHole, playingTeeCode, teePositionsByCode]
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
          pinFromFlag?: boolean;
        };
        if (cancelled) return;

        // ¿El objetivo del hoyo es la bandera del día? (para el rótulo).
        setPinFromFlag(!!(greenData.ok && greenData.pinFromFlag));

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
          setPinFromFlag(false);
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

  const greenPuttPreview = useMemo(() => {
    if (!greenPuttAdjust || !activeHolePoints?.center) return null;
    const mark = { lat: greenPuttAdjust.markLat, lon: greenPuttAdjust.markLon };
    const ball = ballAtPuttYardsFromHole(
      activeHolePoints.center,
      mark,
      greenPuttAdjust.puttYards
    );
    return {
      ball,
      mark,
      puttYds: greenPuttAdjust.puttYards,
    };
  }, [greenPuttAdjust, activeHolePoints]);

  const pendingShot = useMemo(
    () => pendingShotOnHole(holeShotsStore, activeHole),
    [holeShotsStore, activeHole]
  );

  const pendingWaterDrop = useMemo(
    () => pendingWaterDropOnHole(holeShotsStore, activeHole),
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

  const waterDropFocusPoints = useMemo(() => {
    if (!pendingWaterDrop) return null;
    const pts: Array<{ lat: number; lon: number }> = [];
    if (lastBall) pts.push(lastBall);
    const waterShot = lastCompletedShotOnHole;
    if (waterShot?.to && waterShot.lieKind === "water") {
      pts.push(waterShot.to);
    }
    return pts.length > 0 ? pts : null;
  }, [pendingWaterDrop, lastBall, lastCompletedShotOnHole]);

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

  const holeStrokeCount = useMemo(
    () => completedStrokeCount(holeShotsStore, activeHole),
    [holeShotsStore, activeHole]
  );

  const waitingForClubSelection =
    hasTeeMark && pendingShot == null && !pendingWaterDrop;

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

  const completedShotArcs = useMemo(
    () =>
      shotsOnHole
        .filter(
          (s) =>
            s.completedAt != null &&
            s.to &&
            !s.isPenalty &&
            s.catalogId !== "penalty"
        )
        .sort((a, b) => a.strokeNo - b.strokeNo)
        .map((s) => ({
          strokeNo: s.strokeNo,
          from: s.from,
          to: s.to!,
          catalogId: s.catalogId,
          swing: s.swing,
        })),
    [shotsOnHole]
  );

  const playBallPoint = useMemo(() => {
    if (pendingShot?.from) return pendingShot.from;
    if (mapFramingLock) {
      return { lat: mapFramingLock.lat, lon: mapFramingLock.lon };
    }
    if (holeStrokeCount > 0 && lastBall) return lastBall;
    if (teeMark) return teeMark;
    if (
      holeStrokeCount === 0 &&
      catalogTeeForHole &&
      (roundTeeConfirmed || showRoundTeePicker)
    ) {
      return catalogTeeForHole;
    }
    if (geo.status === "ok") return { lat: geo.lat, lon: geo.lon };
    return null;
  }, [
    geo,
    pendingShot,
    mapFramingLock,
    holeStrokeCount,
    lastBall,
    teeMark,
    catalogTeeForHole,
    holeStrokeCount,
    roundTeeConfirmed,
    showRoundTeePicker,
  ]);

  /** Encuadre del mapa: última bola, replay tras OB, o teléfono mientras esperas caída. */
  const mapFramingPoint = useMemo(() => {
    if (mapFramingLock) return mapFramingLock;
    if (pendingShot && geo.status === "ok") {
      return framingPinAt({ lat: geo.lat, lon: geo.lon }, centerlines[activeHole]);
    }
    const pt =
      lastBall ??
      (needsTeeMark && catalogTeeForHole ? catalogTeeForHole : null) ??
      teeMark ??
      null;
    if (!pt) return null;
    return framingPinAt(pt, centerlines[activeHole]);
  }, [
    mapFramingLock,
    pendingShot,
    geo,
    lastBall,
    needsTeeMark,
    catalogTeeForHole,
    teeMark,
    centerlines,
    activeHole,
  ]);

  const liveGreenYds = useMemo(() => {
    if (!activeHolePoints || needsTeeMark) return null;
    if (greenPuttPreview) {
      const dist = greenDistancesForHole(
        greenPuttPreview.ball.lat,
        greenPuttPreview.ball.lon,
        activeHolePoints
      );
      return { ...dist, center: greenPuttPreview.puttYds };
    }
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
  }, [activeHolePoints, needsTeeMark, tapPoint, lastBall, teeMark, geo, greenPuttPreview]);

  const playGreenYds = useMemo(() => {
    if (!activeHolePoints || needsTeeMark) return null;
    if (greenPuttPreview) {
      const dist = greenDistancesForHole(
        greenPuttPreview.ball.lat,
        greenPuttPreview.ball.lon,
        activeHolePoints
      );
      return { ...dist, center: greenPuttPreview.puttYds };
    }
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
  }, [lastBall, teeMark, activeHolePoints, needsTeeMark, geo, tapPoint, greenPuttPreview]);

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
    setShotPreview(null);
    setDistanceMode(false);
    setMeasureFromPhoneOnce(false);
  }, []);

  const handleShotPreviewChange = useCallback((preview: ShotPreview) => {
    setShotPreview(preview);
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
    (lat: number, lon: number, puttYardsOverride?: number) => {
      if (!activeHolePoints) return;
      const dist = greenDistancesForHole(lat, lon, activeHolePoints);
      const lie = detectLieForPoint(lat, lon);
      const onGreen = lie.onGreen;
      const inBunker = lie.inBunker;
      const lieKind = lie.kind;
      const yardsToGreen =
        onGreen && puttYardsOverride != null
          ? puttYardsFromCenter(puttYardsOverride)
          : onGreen
            ? puttYardsFromCenter(dist.center)
            : isShortGameDistance(dist.center)
              ? yardsToGreenCenterRounded(dist.center)
              : Math.round(dist.center / 5) * 5;
      if (yardsToGreen <= 0) return;
      setShotPreview(null);
      setPlanContext({
        yardsToGreen,
        greenDist: {
          front: dist.front,
          center:
            onGreen && puttYardsOverride != null ? yardsToGreen : dist.center,
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

  const syncPuttYardsForGreen = useCallback(
    (puttYards: number, ballLat: number, ballLon: number) => {
      if (!activeHolePoints) return;
      const dist = greenDistancesForHole(ballLat, ballLon, activeHolePoints);
      const lie = detectLieForPoint(ballLat, ballLon);
      const yardsToGreen = puttYardsFromCenter(puttYards);
      setTargetYards(yardsToGreen);
      setPlanContext({
        yardsToGreen,
        greenDist: {
          front: dist.front,
          center: yardsToGreen,
          back: dist.back,
        },
        lieKind: lie.kind,
        onGreen: lie.onGreen,
        inBunker: lie.inBunker,
      });
      setPlanSession((s) => s + 1);
    },
    [activeHolePoints, detectLieForPoint]
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
    if (greenPuttAdjust) {
      return { kind: "green", onGreen: true };
    }
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
    greenPuttAdjust,
  ]);

  /** Pill superior: yardas al hoyo sincronizadas con el ajuste de putt. */
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
      if (resumeHole == null && !holeCorrectionMode) {
        setResumeHole(activeHole);
      }
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
        const targetLabel = pinFromFlag ? "a la bandera 🚩" : "al centro";
        setArrivalToast(
          wasMarked
            ? `Salida corregida · ${toGreen} yds ${targetLabel}`
            : `Salida marcada · ${toGreen} yds ${targetLabel}`
        );
      } else {
        setShotPlanOpen(false);
        setArrivalToast(`Salida del hoyo ${activeHole} marcada`);
      }
    },
    [
      holeShotsStore,
      activeHole,
      bagScope,
      activeHolePoints,
      openPlanFromPoint,
      pinMapFraming,
      resumeHole,
      holeCorrectionMode,
      pinFromFlag,
    ]
  );

  const confirmRoundTee = useCallback(
    (code: TeeSetCode, startHole: number) => {
      setPlayingTeeCode(code);
      savePlayingTeeCode(code, bagScope);
      setRoundTeeConfirmed(true);
      setShowRoundTeePicker(false);
      setRoundStartHole(startHole);
      setManualHole(startHole);
      const tee = resolveTeePosition(startHole, code, teePositionsByCode);
      if (!tee) {
        setArrivalToast(
          `Salida ${teeSetLabel(code)} sin calibrar en H${startHole}`
        );
        return;
      }
      setHoleShotsStore((prev) => {
        const next = setHoleTeeMark(prev, startHole, tee);
        saveHoleShots(next, bagScope);
        return next;
      });
      if (resumeHole == null) setResumeHole(startHole);
      autoPlanHoleRef.current = null;
      pinMapFraming({ lat: tee.lat, lon: tee.lon });
      pendingHoleTeePlanRef.current = {
        hole: startHole,
        lat: tee.lat,
        lon: tee.lon,
      };
      setArrivalToast(
        `Salida ${teeSetLabel(code)} · hoyo ${startHole} · elige bastón`
      );
    },
    [
      bagScope,
      teePositionsByCode,
      pinMapFraming,
      resumeHole,
    ]
  );

  const finishHoleAndAdvance = useCallback(
    (how: "in" | "given") => {
      if (!holeFinishPrompt) return;
      const { hole, lat, lon, strokeCount, centerYards } = holeFinishPrompt;
      const center = activeHolePoints?.center;
      const pin =
        center != null
          ? how === "in"
            ? holedPinPosition(center)
            : snapLandingToGreenCenter({ lat, lon }, center, centerYards)
          : { lat, lon };

      const result =
        how === "given"
          ? recordGivenPutt(holeShotsStore, hole, pin)
          : recordHoledPutt(holeShotsStore, hole, pin);
      const startHole = inferRoundStartHole(holeShotsStore);
      const finishingRound = isRoundFinishingHole(hole, startHole);
      const nextHoleNum = (hole % 18) + 1;
      let nextStore = finishingRound
        ? result.store
        : clearHoleShots(result.store, nextHoleNum);
      const nextTee = finishingRound
        ? null
        : resolveTeePosition(nextHoleNum, playingTeeCode, teePositionsByCode);
      if (nextTee) {
        nextStore = setHoleTeeMark(nextStore, nextHoleNum, nextTee);
      }

      setHoleShotsStore(nextStore);
      saveHoleShots(nextStore, bagScope);
      setHoleFinishPrompt(null);
      resetTapUi();
      setTapPoint(null);
      setPendingTap(null);
      autoCandidateRef.current = { hole: 0, count: 0 };

      if (finishingRound) {
        const totals = roundStrokeTotals(result.store, startHole);
        setRoundSummary(totals);
        setArrivalToast(
          `Ronda terminada · ${totals.total} golpes (${totals.firstNine} + ${totals.secondNine})`
        );
        return;
      }

      const totalStrokes = result.totalStrokes ?? strokeCount;
      setAutoHole(nextHoleNum);
      setManualHole(nextHoleNum);
      setResumeHole(nextHoleNum);
      setTargetYards(0);
      if (demoMode) setDemoProgress(0);
      autoPlanHoleRef.current = null;
      if (nextTee) {
        pinMapFraming({ lat: nextTee.lat, lon: nextTee.lon });
        pendingHoleTeePlanRef.current = {
          hole: nextHoleNum,
          lat: nextTee.lat,
          lon: nextTee.lon,
        };
      }
      const howLabel = how === "given" ? " · quedó dada" : "";
      const teeLabel = nextTee ? ` · Salida ${teeSetLabel(playingTeeCode)} lista` : "";
      setArrivalToast(
        `Hoyo ${hole} terminado${howLabel} (${totalStrokes} golpes) · Hoyo ${nextHoleNum}${teeLabel}`
      );
    },
    [
      holeFinishPrompt,
      holeShotsStore,
      bagScope,
      resetTapUi,
      demoMode,
      activeHolePoints,
      playingTeeCode,
      teePositionsByCode,
      pinMapFraming,
    ]
  );

  const advanceAfterAutoGreenPutts = useCallback(
    (storeAfterClose: HoleShotsStore, hole: number, totalStrokes: number) => {
      const startHole = inferRoundStartHole(storeAfterClose);
      const finishingRound = isRoundFinishingHole(hole, startHole);
      const nextHoleNum = (hole % 18) + 1;
      let nextStore = finishingRound
        ? storeAfterClose
        : clearHoleShots(storeAfterClose, nextHoleNum);
      const nextTee = finishingRound
        ? null
        : resolveTeePosition(nextHoleNum, playingTeeCode, teePositionsByCode);
      if (nextTee) {
        nextStore = setHoleTeeMark(nextStore, nextHoleNum, nextTee);
      }

      setHoleShotsStore(nextStore);
      saveHoleShots(nextStore, bagScope);
      setGreenEntryPuttPrompt(null);
      resetTapUi();
      setTapPoint(null);
      setPendingTap(null);
      autoCandidateRef.current = { hole: 0, count: 0 };

      if (finishingRound) {
        const totals = roundStrokeTotals(storeAfterClose, startHole);
        setRoundSummary(totals);
        setArrivalToast(
          `Ronda terminada · ${totals.total} golpes (${totals.firstNine} + ${totals.secondNine})`
        );
        return;
      }

      setAutoHole(nextHoleNum);
      setManualHole(nextHoleNum);
      setResumeHole(nextHoleNum);
      setTargetYards(0);
      if (demoMode) setDemoProgress(0);
      autoPlanHoleRef.current = null;
      if (nextTee) {
        pinMapFraming({ lat: nextTee.lat, lon: nextTee.lon });
        pendingHoleTeePlanRef.current = {
          hole: nextHoleNum,
          lat: nextTee.lat,
          lon: nextTee.lon,
        };
      }
      const teeLabel = nextTee
        ? ` · Salida ${teeSetLabel(playingTeeCode)} lista`
        : "";
      setArrivalToast(
        `Hoyo ${hole} terminado (${totalStrokes} golpes) · Hoyo ${nextHoleNum}${teeLabel}`
      );
    },
    [
      playingTeeCode,
      teePositionsByCode,
      bagScope,
      resetTapUi,
      demoMode,
      pinMapFraming,
    ]
  );

  const handleUndoGreenEntryPuttPrompt = useCallback(() => {
    greenEntrySuppressUntilRef.current = Date.now() + 30_000;
    setGreenEntryPuttPrompt(null);
    setArrivalToast("Lectura GPS descartada · sigue jugando");
  }, []);

  const handleConfirmGreenEntryPutts = useCallback(() => {
    if (!greenEntryPuttPrompt || !activeHolePoints?.center) return;
    const puttCount = Math.max(1, greenEntryPuttPrompt.puttCount);
    const normalizedYards = greenEntryPuttPrompt.puttYards
      .slice(0, puttCount)
      .map((v) => {
        const n = Number(v);
        if (!Number.isFinite(n)) return NaN;
        return Math.max(0, Math.min(GREEN_PUTT_MAX_YARDS, Math.round(n)));
      });
    if (normalizedYards.some((v) => Number.isNaN(v))) {
      setArrivalToast("Captura las yardas de todos los putts");
      return;
    }

    let nextStore = holeShotsStore;
    const pin = holedPinPosition(activeHolePoints.center);
    let from =
      lastBallPosition(nextStore, activeHole, catalogTeeForHole ?? undefined) ??
      holeTeeMark(nextStore, activeHole) ?? {
        lat: greenEntryPuttPrompt.entryLat,
        lon: greenEntryPuttPrompt.entryLon,
      };

    if (greenEntryPuttPrompt.pendingShotId) {
      const pending = pendingShotOnHole(nextStore, activeHole);
      if (!pending || pending.id !== greenEntryPuttPrompt.pendingShotId) {
        setArrivalToast("No se encontró el golpe pendiente a cerrar");
        return;
      }
      const puttYdsAtEntry = puttDistanceToHole(
        {
          lat: greenEntryPuttPrompt.entryLat,
          lon: greenEntryPuttPrompt.entryLon,
        },
        activeHolePoints.center
      );
      const landing = snapLandingToGreenCenter(
        {
          lat: greenEntryPuttPrompt.entryLat,
          lon: greenEntryPuttPrompt.entryLon,
        },
        activeHolePoints.center,
        puttYdsAtEntry
      );
      const actual = strokeActualYards(
        pending.from,
        landing,
        "green",
        pending.catalogId
      );
      nextStore = completeShotArrival(
        nextStore,
        activeHole,
        pending.id,
        landing,
        actual,
        "green"
      );
      from = landing;
    }

    for (let i = 0; i < puttCount; i++) {
      const puttYds = Math.max(1, normalizedYards[i] ?? 1);
      const planned = addPlannedShot(
        nextStore,
        activeHole,
        from,
        "putter",
        "full",
        puttYds
      );
      const to =
        i === puttCount - 1
          ? pin
          : snapLandingToGreenCenter(
              ballAtPuttYardsFromHole(activeHolePoints.center, from, puttYds),
              activeHolePoints.center,
              puttYds
            );
      nextStore = completeShotArrival(
        planned.store,
        activeHole,
        planned.shot.id,
        to,
        puttYds,
        "green"
      );
      from = to;
    }

    const totalStrokes = completedStrokeCount(nextStore, activeHole);
    greenEntryPromptedHoleRef.current = activeHole;
    advanceAfterAutoGreenPutts(nextStore, activeHole, totalStrokes);
  }, [
    greenEntryPuttPrompt,
    activeHolePoints,
    holeShotsStore,
    activeHole,
    catalogTeeForHole,
    advanceAfterAutoGreenPutts,
  ]);

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
    setHoleShotsStore((prev) => {
      const pending = pendingShotOnHole(prev, hole);
      if (!pending) return prev;
      const next = completeShotArrival(
        prev,
        hole,
        pending.id,
        { lat, lon },
        Math.max(1, pending.plannedYards),
        "green"
      );
      saveHoleShots(next, bagScope);
      return next;
    });
    setArrivalToast(
      `Golpe ${strokeCount} registrado · sigues en el hoyo ${hole}`
    );
    openPlanFromPoint(lat, lon);
  }, [holeFinishPrompt, openPlanFromPoint, bagScope]);

  useEffect(() => {
    if (prevActiveHoleRef.current === activeHole) return;
    const pendingPlan = pendingHoleTeePlanRef.current;
    const keepShotPlan = pendingPlan?.hole === activeHole;
    if (prevActiveHoleRef.current !== null) {
      setPendingTap(null);
      setPlanContext(null);
      setDistanceMode(false);
      setMeasureFromPhoneOnce(false);
      setTapPoint(null);
      setTargetYards(0);
      setShotsDetailOpen(false);
      setHoleFinishPrompt(null);
      setGreenPuttAdjust(null);
      setGreenEntryPuttPrompt(null);
      setMapFramingLock(null);
      setHoleCorrectionMode(false);
      greenEntryInsideSinceRef.current = null;
      greenEntryPromptedHoleRef.current = null;
      if (!keepShotPlan) {
        setShotPlanOpen(false);
        autoPlanHoleRef.current = null;
      }
    }
    prevActiveHoleRef.current = activeHole;
  }, [activeHole]);

  // ¿La ronda ya empezó? True si hay CUALQUIER salida marcada o golpe guardado
  // en el store (robusto: no depende de inferir bien el hoyo de salida).
  const roundAlreadyStarted = useMemo(() => {
    const teeMarks = Object.keys(holeShotsStore.teeMarkByHole ?? {}).length > 0;
    const anyShots = Object.values(holeShotsStore.byHole ?? {}).some(
      (arr) => Array.isArray(arr) && arr.length > 0
    );
    return teeMarks || anyShots;
  }, [holeShotsStore]);

  useEffect(() => {
    if (roundAlreadyStarted) {
      // Ronda en curso: confirma y cierra el menú por si se abrió al cargar.
      setRoundTeeConfirmed(true);
      setShowRoundTeePicker(false);
    }
  }, [roundAlreadyStarted]);

  useEffect(() => {
    if (!shotsHydrated) return; // esperar a recuperar la ronda guardada
    if (roundAlreadyStarted) return; // ya iniciada: nunca re-preguntar
    if (farFromCourse && !demoMode) return;
    if (roundTeeConfirmed) return;
    if (!needsTeeMark) return;
    if (hasLoggedShotsOnHole(holeShotsStore, activeHole)) return;
    const startHole = inferRoundStartHole(holeShotsStore);
    if (activeHole !== startHole) return;
    if (activeHole !== 1 && activeHole !== 10) return;
    setShowRoundTeePicker(true);
  }, [
    shotsHydrated,
    roundAlreadyStarted,
    demoMode,
    farFromCourse,
    roundTeeConfirmed,
    needsTeeMark,
    activeHole,
    holeShotsStore,
  ]);

  useEffect(() => {
    if (showRoundTeePicker) return;
    if (hasHoleTeeMark(holeShotsStore, activeHole)) return;
    const startHole = inferRoundStartHole(holeShotsStore);
    if (
      !roundTeeConfirmed &&
      activeHole === startHole &&
      (activeHole === 1 || activeHole === 10)
    ) {
      return;
    }
    const tee = resolveTeePosition(
      activeHole,
      playingTeeCode,
      teePositionsByCode
    );
    if (!tee) return;
    setHoleShotsStore((prev) => {
      if (hasHoleTeeMark(prev, activeHole)) return prev;
      const next = setHoleTeeMark(prev, activeHole, tee);
      saveHoleShots(next, bagScope);
      return next;
    });
  }, [
    activeHole,
    playingTeeCode,
    teePositionsByCode,
    bagScope,
    holeShotsStore,
    showRoundTeePicker,
    roundTeeConfirmed,
  ]);

  useEffect(() => {
    if (needsTeeMark || !teeMark || showRoundTeePicker) return;
    const pending = pendingHoleTeePlanRef.current;
    if (pending?.hole === activeHole) {
      pendingHoleTeePlanRef.current = null;
      autoPlanHoleRef.current = activeHole;
      pinMapFraming({ lat: pending.lat, lon: pending.lon });
      openPlanFromPoint(pending.lat, pending.lon);
      return;
    }
    const hasCompleted = shotsForHole(holeShotsStore, activeHole).some(
      (s) => s.completedAt != null
    );
    if (hasCompleted) return;
    if (autoPlanHoleRef.current === activeHole) return;
    autoPlanHoleRef.current = activeHole;
    pinMapFraming({ lat: teeMark.lat, lon: teeMark.lon });
    openPlanFromPoint(teeMark.lat, teeMark.lon);
  }, [
    needsTeeMark,
    teeMark,
    activeHole,
    holeShotsStore,
    pinMapFraming,
    openPlanFromPoint,
    showRoundTeePicker,
  ]);

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
    if (pendingWaterDrop) return;
    setWaterDropError(null);
  }, [pendingWaterDrop]);

  useEffect(() => {
    if (!arrivalToast || needsTeeMark || holeFinishPrompt) return;
    const ms =
      arrivalToast.includes("terminado") ||
      arrivalToast.includes("Pasa al hoyo") ||
      arrivalToast.includes("OB ·") ||
      arrivalToast.includes("Lago ·")
        ? 6000
        : 2500;
    const t = window.setTimeout(() => setArrivalToast(null), ms);
    return () => window.clearTimeout(t);
  }, [arrivalToast, needsTeeMark, holeFinishPrompt]);

  useEffect(() => {
    if (needsTeeMark || shotPlanOpen || pendingTap || greenPuttAdjust) return;
    if (distanceMode && tapPoint) return;
    if (liveGreenYds) {
      setTargetYards(
        currentBallLie?.onGreen
          ? puttYardsFromCenter(liveGreenYds.center)
          : Math.round(liveGreenYds.center / 5) * 5
      );
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
    greenPuttAdjust,
    currentBallLie?.onGreen,
  ]);

  useEffect(() => {
    if (!greenPuttPreview) return;
    syncPuttYardsForGreen(
      greenPuttPreview.puttYds,
      greenPuttPreview.ball.lat,
      greenPuttPreview.ball.lon
    );
  }, [greenPuttPreview, syncPuttYardsForGreen]);

  useEffect(() => {
    if (
      geo.status !== "ok" ||
      !activeHolePoints?.center ||
      farFromCourse ||
      needsTeeMark ||
      !hasTeeMark ||
      pendingWaterDrop ||
      holeFinishPrompt ||
      roundSummary
    ) {
      greenEntryInsideSinceRef.current = null;
      return;
    }
    if (greenEntryPromptedHoleRef.current === activeHole) return;
    if (greenEntryPuttPrompt) return;
    if (Date.now() < greenEntrySuppressUntilRef.current) return;

    const onGreenByGps = detectLieForPoint(geo.lat, geo.lon).onGreen;
    if (!onGreenByGps) {
      greenEntryInsideSinceRef.current = null;
      return;
    }

    if (greenEntryInsideSinceRef.current == null) {
      greenEntryInsideSinceRef.current = Date.now();
      return;
    }

    if (Date.now() - greenEntryInsideSinceRef.current < GREEN_ENTRY_DWELL_MS) {
      return;
    }

    const pending = pendingShotOnHole(holeShotsStore, activeHole);
    const measured = Math.max(
      1,
      Math.min(
        GREEN_PUTT_MAX_YARDS,
        puttDistanceToHole({ lat: geo.lat, lon: geo.lon }, activeHolePoints.center)
      )
    );
    greenEntryInsideSinceRef.current = null;
    pinMapFraming(activeHolePoints.center);
    setGreenEntryPuttPrompt({
      hole: activeHole,
      detectedAt: Date.now(),
      entryLat: geo.lat,
      entryLon: geo.lon,
      pendingShotId: pending?.id ?? null,
      puttCount: 2,
      puttYards: [measured, 1],
    });
    setArrivalToast("Entraste al green · captura putts para cerrar el hoyo");
  }, [
    geo,
    activeHole,
    activeHolePoints,
    detectLieForPoint,
    farFromCourse,
    needsTeeMark,
    hasTeeMark,
    pendingWaterDrop,
    holeFinishPrompt,
    roundSummary,
    greenEntryPuttPrompt,
    holeShotsStore,
    pinMapFraming,
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
    if (greenPuttPreview) {
      const dist = greenDistancesForHole(
        greenPuttPreview.ball.lat,
        greenPuttPreview.ball.lon,
        activeHolePoints
      );
      return { ...dist, center: greenPuttPreview.puttYds };
    }
    if (
      currentBallLie?.onGreen &&
      planContext?.onGreen &&
      planContext.yardsToGreen > 0
    ) {
      const from = lastBall ?? teeMark;
      if (from) {
        const dist = greenDistancesForHole(
          from.lat,
          from.lon,
          activeHolePoints
        );
        return { ...dist, center: planContext.yardsToGreen };
      }
    }
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
  }, [
    geo,
    activeHolePoints,
    lastBall,
    teeMark,
    needsTeeMark,
    catalogTeeForHole,
    greenPuttPreview,
    currentBallLie?.onGreen,
    planContext,
  ]);

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

  const greenPuttTapEnabled = useMemo(
    () =>
      !!(
        currentBallLie?.onGreen &&
        hasTeeMark &&
        !needsTeeMark &&
        !pendingShot &&
        !pendingWaterDrop &&
        !shotPlanOpen &&
        !holeFinishPrompt &&
        !distanceMode &&
        !showRoundTeePicker &&
        !greenPuttAdjust &&
        activeHolePoints?.center
      ),
    [
      currentBallLie?.onGreen,
      hasTeeMark,
      needsTeeMark,
      pendingShot,
      pendingWaterDrop,
      shotPlanOpen,
      holeFinishPrompt,
      distanceMode,
      showRoundTeePicker,
      greenPuttAdjust,
      activeHolePoints?.center,
    ]
  );

  const applyPendingShotLanding = useCallback(
    (lat: number, lon: number, puttYards?: number) => {
      if (!pendingShot || !activeHolePoints || geo.status !== "ok") return;
      const lie = detectLieForPoint(lat, lon);
      const centerYds = puttDistanceToHole(
        { lat, lon },
        activeHolePoints.center
      );
      const landing = snapLandingToGreenCenter(
        { lat, lon },
        activeHolePoints.center,
        lie.onGreen ? centerYds : undefined
      );
      const actual = strokeActualYards(
        pendingShot.from,
        landing,
        lie.kind,
        pendingShot.catalogId
      );
      let next = completeShotArrival(
        holeShotsStore,
        activeHole,
        pendingShot.id,
        landing,
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

      if (lie.kind === "water") {
        const replayFrom = {
          lat: pendingShot.from.lat,
          lon: pendingShot.from.lon,
        };
        setHoleShotsStore(next);
        saveHoleShots(next, bagScope);
        next = ensureWaterPenaltyStroke(
          next,
          activeHole,
          pendingShot.id,
          replayFrom
        );
        const strokeCount = completedStrokeCount(next, activeHole);
        setHoleShotsStore(next);
        saveHoleShots(next, bagScope);
        pinMapFraming({ lat, lon });
        setArrivalToast(
          `Lago · golpe ${pendingShot.strokeNo} + castigo (+1) = ${strokeCount} golpes · toca atrás del lago donde jugarás`
        );
        return;
      }

      const toGreen = greenDistancesForHole(
        landing.lat,
        landing.lon,
        activeHolePoints
      );
      setHoleShotsStore(next);
      saveHoleShots(next, bagScope);

      if (shouldPromptHoleFinish(toGreen.center, pendingShot, lie.kind)) {
        const strokeCount = finishPromptStrokeCount(next, activeHole);
        pinMapFraming(landing);
        showHoleFinishPrompt(
          landing.lat,
          landing.lon,
          strokeCount,
          toGreen.center,
          lieArrivalPhrase(lie.kind)
        );
        return;
      }

      setArrivalToast(
        `Golpe ${pendingShot.strokeNo}: ${actual} yds · ${lieArrivalPhrase(lie.kind)} · al green ${toGreen.center}`
      );
      pinMapFraming(landing);
      openPlanFromPoint(
        landing.lat,
        landing.lon,
        lie.onGreen ? puttYards ?? puttYardsFromCenter(toGreen.center) : undefined
      );
    },
    [
      pendingShot,
      activeHolePoints,
      geo.status,
      detectLieForPoint,
      holeShotsStore,
      activeHole,
      bagScope,
      pinMapFraming,
      openPlanFromPoint,
      showHoleFinishPrompt,
    ]
  );

  const confirmGreenPuttAdjust = useCallback(() => {
    if (!greenPuttAdjust || !activeHolePoints?.center) return;
    const mark = { lat: greenPuttAdjust.markLat, lon: greenPuttAdjust.markLon };
    const ball = ballAtPuttYardsFromHole(
      activeHolePoints.center,
      mark,
      greenPuttAdjust.puttYards
    );
    const landing = snapLandingToGreenCenter(
      ball,
      activeHolePoints.center,
      greenPuttAdjust.puttYards
    );

    if (greenPuttAdjust.mode === "relocate") {
      const lie = detectLieForPoint(landing.lat, landing.lon);
      if (!lie.onGreen) {
        setArrivalToast("Mantén la bola en el green");
        return;
      }
      const next = relocateBallOnGreen(
        holeShotsStore,
        activeHole,
        landing,
        lie.kind
      );
      setHoleShotsStore(next);
      saveHoleShots(next, bagScope);
      pinMapFraming(landing);
      setGreenPuttAdjust(null);
      const puttYds = greenPuttAdjust.puttYards;
      syncPuttYardsForGreen(puttYds, landing.lat, landing.lon);
      setArrivalToast(`${puttYds} yds al hoyo`);
      openPlanFromPoint(landing.lat, landing.lon, puttYds);
      return;
    }

    if (!pendingShot) {
      setGreenPuttAdjust(null);
      return;
    }
    const puttYds = greenPuttAdjust.puttYards;
    applyPendingShotLanding(landing.lat, landing.lon, puttYds);
    setGreenPuttAdjust(null);
  }, [
    greenPuttAdjust,
    activeHolePoints,
    detectLieForPoint,
    holeShotsStore,
    activeHole,
    bagScope,
    pinMapFraming,
    pendingShot,
    applyPendingShotLanding,
    syncPuttYardsForGreen,
    openPlanFromPoint,
  ]);

  const onMapTap = useCallback(
    (lat: number, lon: number) => {
      if (geo.status !== "ok" || !activeHolePoints) return;
      if (holeFinishPrompt || greenPuttAdjust || greenEntryPuttPrompt) return;

      if (pendingWaterDrop) {
        const dropLie = detectLieForPoint(lat, lon);
        if (dropLie.kind === "water") {
          setWaterDropError("Marca fuera del agua, atrás del lago");
          return;
        }
        setWaterDropError(null);
        const next = setWaterPenaltyDrop(
          holeShotsStore,
          activeHole,
          pendingWaterDrop.id,
          { lat, lon }
        );
        const strokeCount = completedStrokeCount(next, activeHole);
        setHoleShotsStore(next);
        saveHoleShots(next, bagScope);
        pinMapFraming({ lat, lon });
        setArrivalToast(
          `Lago · suelta marcada · ${strokeCount} golpes · elige bastón`
        );
        openPlanFromPoint(lat, lon);
        return;
      }

      if (needsTeeMark) {
        markTeeAt(lat, lon);
        return;
      }

      if (waitingForClubSelection) {
        if (showRoundTeePicker) return;
        setArrivalToast("Selecciona bastón");
        if (!shotPlanOpen) {
          const from =
            lastBallPosition(
              holeShotsStore,
              activeHole,
              catalogTeeForHole ?? undefined
            ) ?? teeMark;
          if (from) openPlanFromPoint(from.lat, from.lon);
        }
        return;
      }

      if (pendingShot) {
        if (!hasTeeMark) {
          setArrivalToast("Marca tu salida antes de registrar un golpe");
          return;
        }
        const lie = detectLieForPoint(lat, lon);
        const toGreenBefore = greenDistancesForHole(lat, lon, activeHolePoints);
        if (lie.onGreen) {
          const measured = puttYardsFromCenter(toGreenBefore.center);
          setGreenPuttAdjust({
            markLat: lat,
            markLon: lon,
            measuredYards: measured,
            puttYards: measured,
            mode: "landing",
          });
          pinMapFraming({ lat, lon });
          return;
        }
        // No marcar el golpe directo: mostrar botones D/G para que el usuario
        // elija — D = solo medir distancia a ese punto; G = ahí quedó la bola.
        setPendingTap({ lat, lon });
        return;
      }

      if (greenPuttTapEnabled) {
        const lie = detectLieForPoint(lat, lon);
        if (lie.onGreen) {
          const measured = puttDistanceToHole(
            { lat, lon },
            activeHolePoints.center
          );
          setGreenPuttAdjust({
            markLat: lat,
            markLon: lon,
            measuredYards: measured,
            puttYards: measured,
            mode: "relocate",
          });
          pinMapFraming({ lat, lon });
          return;
        }
        setArrivalToast("Mantén la bola en el green");
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
      waitingForClubSelection,
      teeMark,
      hasTeeMark,
      catalogTeeForHole,
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
      pendingWaterDrop,
      showRoundTeePicker,
      greenPuttAdjust,
      greenEntryPuttPrompt,
      greenPuttTapEnabled,
      applyPendingShotLanding,
    ]
  );

  const handleUseGpsBallPosition = useCallback(() => {
    if (geo.status !== "ok" || !activeHolePoints) {
      setArrivalToast("Espera a que el GPS tenga señal para usar tu posición");
      return;
    }
    onMapTap(geo.lat, geo.lon);
  }, [activeHolePoints, geo, onMapTap, setArrivalToast]);

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
    // Si hay un golpe pendiente (ya elegiste bastón), "G" = ahí quedó la bola.
    if (pendingShot && pendingTap) {
      applyPendingShotLanding(pendingTap.lat, pendingTap.lon);
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
  }, [
    hasTeeMark,
    pendingShot,
    pendingTap,
    applyPendingShotLanding,
    playFromPoint,
    openPlanFromPoint,
    pinMapFraming,
  ]);

  const handleAddPenalty = useCallback(
    (reason: ManualPenaltyReason) => {
      if (!activeHolePoints) {
        setArrivalToast("No se pudo anotar el castigo · espera a que cargue el hoyo");
        return;
      }

      const result: {
        from: { lat: number; lon: number } | null;
        count: number;
        added: boolean;
      } = { from: null, count: 0, added: false };

      setHoleShotsStore((prev) => {
        const tee = holeTeeMark(prev, activeHole);
        if (!tee) return prev;
        const from =
          lastBallPosition(prev, activeHole, catalogTeeForHole ?? undefined) ?? tee;
        const before = completedStrokeCount(prev, activeHole);
        const next = addManualPenaltyStroke(prev, activeHole, from, reason);
        const after = completedStrokeCount(next, activeHole);
        if (after <= before) return prev;
        saveHoleShots(next, bagScope);
        result.from = from;
        result.count = after;
        result.added = true;
        return next;
      });

      if (!result.added || !result.from) {
        setArrivalToast("Marca tu salida antes de anotar castigos");
        return;
      }
      pinMapFraming(result.from);
      setArrivalToast(
        `${penaltyReasonLabel(reason)} · +1 = ${result.count} golpes`
      );
      openPlanFromPoint(result.from.lat, result.from.lon);
    },
    [
      activeHolePoints,
      activeHole,
      catalogTeeForHole,
      bagScope,
      pinMapFraming,
      openPlanFromPoint,
    ]
  );

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
        lastBallPosition(holeShotsStore, activeHole, catalogTeeForHole ?? undefined) ??
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
        setShotPreview(null);
        pinMapFraming(from);
        const strokeCount = finishPromptStrokeCount(store, activeHole);
        showHoleFinishPrompt(
          activeHolePoints.center.lat,
          activeHolePoints.center.lon,
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
      setShotPreview(null);
      setMapFramingLock(null);
      setArrivalToast(
        "Golpe registrado · al llegar toca donde quedó la bola"
      );
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
      bagRef.current = next;
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
      if (delta === -1) {
        wasOnManualHoleRef.current = false;
      }
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
      setRoundSummary(null);
      setHoleShotsStore((prev) => {
        const next = withRoundStartHole(clearHoleShots(prev, n), n);
        saveHoleShots(next, bagScope);
        return next;
      });
      setTapPoint(null);
      setTargetYards(0);
      resetTapUi();
      setShotsDetailOpen(false);
      setMapFramingLock(null);
      autoPlanHoleRef.current = null;
      pendingHoleTeePlanRef.current = null;
      setManualHole(n);
      setResumeHole(n);
      setHoleCorrectionMode(false);
      setRoundTeeConfirmed(false);
      setShowRoundTeePicker(true);
      setArrivalToast(null);
      const previewTee = resolveTeePosition(
        n,
        playingTeeCode,
        teePositionsByCode
      );
      if (previewTee) pinMapFraming({ lat: previewTee.lat, lon: previewTee.lon });
      if (demoMode) setDemoProgress(0.35);
    },
    [
      insideHole,
      bagScope,
      resetTapUi,
      demoMode,
      playingTeeCode,
      teePositionsByCode,
      pinMapFraming,
    ]
  );

  const resetActiveHole = useCallback(() => {
    autoPlanHoleRef.current = null;
    const tee = resolveTeePosition(
      activeHole,
      playingTeeCode,
      teePositionsByCode
    );
    setHoleShotsStore((prev) => {
      let next = clearHoleShots(prev, activeHole);
      if (tee) next = setHoleTeeMark(next, activeHole, tee);
      saveHoleShots(next, bagScope);
      return next;
    });
    setTapPoint(null);
    setTargetYards(0);
    resetTapUi();
    setShotsDetailOpen(false);
    setMapFramingLock(null);
    if (tee) {
      pinMapFraming({ lat: tee.lat, lon: tee.lon });
      pendingHoleTeePlanRef.current = {
        hole: activeHole,
        lat: tee.lat,
        lon: tee.lon,
      };
    } else {
      pendingHoleTeePlanRef.current = null;
    }
    setArrivalToast(`Hoyo ${activeHole} reiniciado · elige bastón`);
  }, [
    activeHole,
    playingTeeCode,
    teePositionsByCode,
    bagScope,
    resetTapUi,
    pinMapFraming,
  ]);

  const canOfferHoleCorrection =
    resumeHole != null &&
    activeHole !== resumeHole &&
    hasRemovableShotsOnHole(holeShotsStore, activeHole);

  const enterHoleCorrection = useCallback(() => {
    setHoleCorrectionMode(true);
    setShotsDetailOpen(false);
    setShotPlanOpen(false);
    setPlanContext(null);
    setHoleFinishPrompt(null);
    resetTapUi();
    setTapPoint(null);
    setPendingTap(null);
    setArrivalToast(`Corregir hoyo ${activeHole} · ✕ quita el último golpe`);
  }, [activeHole, resetTapUi]);

  const removeLastShotOnActiveHole = useCallback(() => {
    if (!hasRemovableShotsOnHole(holeShotsStore, activeHole)) return;
    const next = removeLastShotOnHole(holeShotsStore, activeHole);
    setHoleShotsStore(next);
    saveHoleShots(next, bagScope);
    resetTapUi();
    setShotPlanOpen(false);
    setPlanContext(null);
    setHoleFinishPrompt(null);
    setShotsDetailOpen(false);
    setMapFramingLock(null);
    const pt =
      lastBallPosition(next, activeHole, catalogTeeForHole ?? undefined) ??
      holeTeeMark(next, activeHole) ??
      catalogTeeForHole;
    if (pt) pinMapFraming(pt);
    setArrivalToast(
      hasRemovableShotsOnHole(next, activeHole)
        ? `Golpe quitado · sigue con ✕ o vuelve a anotar`
        : `Golpes borrados · anota de nuevo el hoyo ${activeHole}`
    );
  }, [
    activeHole,
    bagScope,
    holeShotsStore,
    catalogTeeForHole,
    resetTapUi,
    pinMapFraming,
  ]);

  const returnToResumeHole = useCallback(() => {
    if (resumeHole == null) return;
    setHoleCorrectionMode(false);
    resetTapUi();
    setTapPoint(null);
    setPendingTap(null);
    setShotsDetailOpen(false);
    setShotPlanOpen(false);
    setHoleFinishPrompt(null);
    setMapFramingLock(null);
    wasOnManualHoleRef.current = insideHole === resumeHole;
    setManualHole(resumeHole);
    const pt =
      lastBallPosition(
        holeShotsStore,
        resumeHole,
        catalogTeeForHole ?? undefined
      ) ??
      holeTeeMark(holeShotsStore, resumeHole) ??
      null;
    if (pt) pinMapFraming(pt);
    setArrivalToast(`De vuelta al hoyo ${resumeHole}`);
  }, [
    resumeHole,
    insideHole,
    resetTapUi,
    holeShotsStore,
    catalogTeeForHole,
    pinMapFraming,
  ]);

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
            awaitingClubAtTee={waitingForClubSelection}
            shotLandings={shotLandings}
            completedShotArcs={completedShotArcs}
            playBallPoint={playBallPoint}
            waterDropMode={!!pendingWaterDrop}
            awaitingLandingMode={
              !!pendingShot && !pendingWaterDrop && !shotPlanOpen
            }
            waterDropFocusPoints={waterDropFocusPoints}
            mapFramingPoint={mapFramingPoint}
            catalogTeePoint={
              (needsTeeMark || showRoundTeePicker) && catalogTeeForHole
                ? catalogTeeForHole
                : null
            }
            ballOnGreen={
              greenEntryPuttPrompt != null || (currentBallLie?.onGreen ?? false)
            }
            greenCenterPoint={activeHolePoints?.center ?? null}
            shotPreview={shotPlanOpen ? shotPreview : null}
            greenPuttPreview={greenPuttPreview}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-900 px-6 text-center text-sm text-slate-300">
            {geo.status === "denied" || geo.status === "error"
              ? `⚠ ${geo.message}`
              : "📡 Esperando GPS…"}
          </div>
        )}
      </div>

      {/* ← regresar al menú + total de golpes en el hoyo (al lado izquierdo). */}
      <div className="absolute right-2 top-2 z-[1000] flex items-center gap-2">
        {hasTeeMark && !farFromCourse && !needsTeeMark ? (
          <div
            className="flex min-w-[2.75rem] flex-col items-center justify-center rounded-full border border-white/30 bg-black/55 px-2 py-0.5 shadow-lg backdrop-blur-sm"
            aria-label={`${holeStrokeCount} golpe${holeStrokeCount === 1 ? "" : "s"} en el hoyo ${activeHole}`}
          >
            <span className="text-[8px] font-bold uppercase leading-none text-slate-400">
              H{activeHole}
            </span>
            <span className="text-3xl font-black tabular-nums leading-none text-white">
              {holeStrokeCount}
            </span>
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const w = window as unknown as {
              Telegram?: { WebApp?: { close?: () => void } };
            };
            // En Telegram: cerrar la mini app vuelve al chat/menú del bot.
            if (w?.Telegram?.WebApp?.close) {
              w.Telegram.WebApp.close();
              return;
            }
            // Navegador in-app: regresar a la página anterior si la hay.
            if (typeof window !== "undefined" && window.history.length > 1) {
              window.history.back();
            }
          }}
          aria-label="Regresar al menú anterior"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/55 text-xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
        >
          ←
        </button>
      </div>

      <div
        className={[
          "absolute left-2 z-[1000] flex gap-1.5",
          demoMode ? "top-11" : "top-2",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setBagOpen(true)}
          className="rounded-full border border-white/30 bg-black/55 px-2.5 py-1.5 text-[11px] font-black text-emerald-200 shadow-lg backdrop-blur-sm active:scale-95"
        >
          Bolsa
        </button>
        <button
          type="button"
          onClick={() => setStatsOpen(true)}
          className="rounded-full border border-white/30 bg-black/55 px-2.5 py-1.5 text-[11px] font-black text-sky-200 shadow-lg backdrop-blur-sm active:scale-95"
          aria-label="Estadísticas de la ronda"
        >
          Stats
        </button>
        <button
          type="button"
          onClick={() => setFlagSheetOpen(true)}
          className="rounded-full border border-white/30 bg-black/55 px-2.5 py-1.5 text-[11px] font-black text-amber-200 shadow-lg backdrop-blur-sm active:scale-95"
          aria-label="Ver posición de la bandera"
        >
          🚩 Bandera
        </button>
        <button
          type="button"
          onClick={handleUseGpsBallPosition}
          disabled={demoMode || farFromCourse || geo.status !== "ok"}
          className="rounded-full border border-white/30 bg-black/55 px-2.5 py-1.5 text-[11px] font-black text-amber-200 shadow-lg backdrop-blur-sm active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          aria-label="Usar GPS para marcar dónde quedó la bola"
          title="Usar la posición GPS actual para marcar dónde quedó la bola"
        >
          📍 Bola GPS
        </button>
      </div>

      {demoMode ? (
        <div className="pointer-events-none absolute left-2 top-2 z-[1000]">
          <div className="rounded-full bg-amber-500/95 px-2.5 py-1 text-[10px] font-black leading-tight text-amber-950 shadow-lg">
            DEMO · en casa · sin GPS
          </div>
        </div>
      ) : null}

      <PlayerBagSheet
        open={bagOpen}
        bag={bag}
        onChange={handleBagChange}
        onClose={() => {
          savePlayerBag(bagRef.current, bagScope);
          setBagOpen(false);
        }}
      />

      <YardageStatsSheet
        open={statsOpen}
        store={holeShotsStore}
        pars={parByHole}
        onClose={() => setStatsOpen(false)}
      />

      <HoleShotsDetailSheet
        open={shotsDetailOpen}
        hole={activeHole}
        store={holeShotsStore}
        onClose={() => setShotsDetailOpen(false)}
        onCorrectLanding={(shotId) => correctLastShotLanding(shotId)}
      />

      {showRoundTeePicker && !farFromCourse ? (
        <RoundTeePickerOverlay
          holeNo={activeHole}
          selectedCode={playingTeeCode}
          onSelect={confirmRoundTee}
        />
      ) : null}

      {flagSheetOpen ? (
        <FlagPositionSheet
          hole={activeHole}
          courseId={defaultDistanciasCourseId()}
          onClose={() => setFlagSheetOpen(false)}
        />
      ) : null}

      {pendingTap && !farFromCourse && !needsTeeMark && !pendingWaterDrop ? (
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

      {pendingWaterDrop && !farFromCourse && !needsTeeMark ? (
        <div className="pointer-events-none absolute inset-x-2 top-12 z-[1065] rounded-lg border border-sky-400/50 bg-sky-950/90 px-3 py-1.5 shadow-lg backdrop-blur-md">
          <p className="text-center text-[10px] font-black leading-tight text-sky-50">
            Lago +1 · toca atrás del lago donde jugarás
          </p>
          {waterDropError ? (
            <p className="mt-0.5 text-center text-[10px] font-semibold text-amber-200">
              {waterDropError}
            </p>
          ) : null}
        </div>
      ) : null}

      {greenPuttAdjust && !farFromCourse ? (
        <div className="pointer-events-none absolute bottom-[6.75rem] right-2 z-[1090]">
          <GreenPuttDistancePanel
            puttYards={greenPuttAdjust.puttYards}
            measuredYards={greenPuttAdjust.measuredYards}
            mode={greenPuttAdjust.mode}
            onPuttYardsChange={(yards) =>
              setGreenPuttAdjust((prev) =>
                prev ? { ...prev, puttYards: yards } : null
              )
            }
            onConfirm={confirmGreenPuttAdjust}
            onCancel={() => setGreenPuttAdjust(null)}
          />
        </div>
      ) : null}

      {greenEntryPuttPrompt && !farFromCourse ? (
        <div className="pointer-events-none absolute inset-x-0 top-[20%] z-[1093] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-xl border-2 border-emerald-400/60 bg-emerald-950/98 px-4 py-3 shadow-2xl backdrop-blur-md">
            <p className="text-center text-xs font-black text-emerald-50">
              Green detectado · Hoyo {greenEntryPuttPrompt.hole}
            </p>
            <p className="mt-1 text-center text-[11px] font-semibold text-emerald-200">
              GPS estable hace {timeAgo(greenEntryPuttPrompt.detectedAt)} · captura obligatoria de putts
            </p>

            <div className="mt-3 rounded-lg border border-white/15 bg-black/35 p-3">
              <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-300">
                Cantidad de putts
              </label>
              <input
                type="number"
                min={1}
                max={6}
                value={greenEntryPuttPrompt.puttCount}
                onChange={(e) => {
                  const count = Math.max(1, Math.min(6, Number(e.target.value) || 1));
                  setGreenEntryPuttPrompt((prev) => {
                    if (!prev) return prev;
                    const y = prev.puttYards.slice(0, count);
                    while (y.length < count) y.push(1);
                    return { ...prev, puttCount: count, puttYards: y };
                  });
                }}
                className="mt-1 w-full rounded-md border border-white/20 bg-black/50 px-2 py-1.5 text-sm font-black text-white outline-none"
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                {greenEntryPuttPrompt.puttYards
                  .slice(0, greenEntryPuttPrompt.puttCount)
                  .map((yds, idx) => (
                    <label
                      key={`putt-yard-${idx + 1}`}
                      className="rounded-md border border-white/10 bg-black/30 px-2 py-1"
                    >
                      <span className="block text-[10px] font-bold text-slate-300">
                        Putt {idx + 1} (0-{GREEN_PUTT_MAX_YARDS})
                      </span>
                      <input
                        type="number"
                        min={0}
                        max={GREEN_PUTT_MAX_YARDS}
                        value={yds}
                        onChange={(e) => {
                          const raw = Number(e.target.value);
                          const val = Number.isFinite(raw)
                            ? Math.max(0, Math.min(GREEN_PUTT_MAX_YARDS, Math.round(raw)))
                            : 0;
                          setGreenEntryPuttPrompt((prev) => {
                            if (!prev) return prev;
                            const next = [...prev.puttYards];
                            next[idx] = val;
                            return { ...prev, puttYards: next };
                          });
                        }}
                        className="mt-1 w-full rounded-md border border-white/20 bg-black/50 px-2 py-1.5 text-sm font-black text-white outline-none"
                      />
                    </label>
                  ))}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                onClick={handleConfirmGreenEntryPutts}
                className="rounded-lg bg-emerald-600 px-3 py-2.5 text-xs font-black text-white active:scale-[0.98]"
              >
                Guardar putts y cerrar hoyo
              </button>
              <button
                type="button"
                onClick={handleUndoGreenEntryPuttPrompt}
                className="rounded-lg border border-amber-400/50 bg-amber-950/80 px-3 py-2 text-[11px] font-bold text-amber-200 active:scale-[0.98]"
              >
                Deshacer (detección errónea)
              </button>
            </div>
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
              {holeFinishPrompt.centerYards <= 1
                ? "Estás a menos de 1 yd · ¿entró al hoyo?"
                : `Estás a ${Math.round(holeFinishPrompt.centerYards)} yds · ¿entró al hoyo?`}
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

      {roundSummary && !farFromCourse ? (
        <div className="pointer-events-none absolute inset-x-0 top-[22%] z-[1105] flex justify-center px-4">
          <div className="pointer-events-auto w-full max-w-sm rounded-xl border-2 border-amber-300/70 bg-slate-950/98 px-4 py-4 shadow-2xl backdrop-blur-md">
            <p className="text-center text-sm font-black text-amber-100">
              Ronda terminada
            </p>
            <div className="mt-3 space-y-2 text-center">
              <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  1ª vuelta · {roundNineLabel(roundSummary.firstNineHoles)}
                </p>
                <p className="text-2xl font-black tabular-nums text-white">
                  {roundSummary.firstNine}
                  <span className="ml-1 text-sm font-bold text-slate-300">
                    golpes
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-white/10 bg-black/40 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  2ª vuelta · {roundNineLabel(roundSummary.secondNineHoles)}
                </p>
                <p className="text-2xl font-black tabular-nums text-white">
                  {roundSummary.secondNine}
                  <span className="ml-1 text-sm font-bold text-slate-300">
                    golpes
                  </span>
                </p>
              </div>
              <div className="rounded-lg border border-amber-400/40 bg-amber-950/50 px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
                  Total ronda
                </p>
                <p className="text-3xl font-black tabular-nums text-amber-100">
                  {roundSummary.total}
                  <span className="ml-1 text-base font-bold text-amber-200/80">
                    golpes
                  </span>
                </p>
              </div>
            </div>
            <YardageStatsSummaryCompact stats={roundYardageStats} />
            <button
              type="button"
              onClick={() => {
                setRoundSummary(null);
                setStatsOpen(true);
              }}
              className="mt-2 w-full rounded-lg border border-sky-400/50 bg-sky-950/80 px-3 py-2 text-[11px] font-black text-sky-100 active:scale-[0.98]"
            >
              Ver reporte completo
            </button>
            <button
              type="button"
              onClick={() => setRoundSummary(null)}
              className="mt-2 w-full rounded-lg bg-amber-500 px-3 py-2.5 text-xs font-black text-black active:scale-[0.98]"
            >
              Entendido
            </button>
          </div>
        </div>
      ) : null}

      {/* Controles abajo: selector de hoyo + distancias al green. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex flex-col items-stretch">
        {arrivalToast && !needsTeeMark && !pendingWaterDrop ? (
          <div
            className={[
              "pointer-events-none mx-2 mb-1 rounded-lg px-3 py-1.5 text-center text-[11px] font-semibold shadow-lg",
              arrivalToast.includes("OB ·")
                ? "border border-red-500/50 bg-red-950/95 text-red-100"
                : arrivalToast.includes("Lago ·")
                  ? "border border-sky-500/50 bg-sky-950/95 text-sky-100"
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
                Golpe {pendingShot.strokeNo} · al llegar, toca donde quedó la
                bola
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
            {/* Salida elegida en el menú (1 o 10). Solo informativo. */}
            <div className="flex flex-col gap-0.5">
              {roundStartHole != null ? (
                <div className="rounded-md border border-amber-300/60 bg-black/60 px-2 py-0.5 text-[10px] font-black leading-tight text-amber-100 shadow-lg backdrop-blur-sm">
                  Salida H{roundStartHole}
                </div>
              ) : null}
              {canOfferHoleCorrection && !holeCorrectionMode ? (
                <button
                  type="button"
                  onClick={enterHoleCorrection}
                  aria-label={`Corregir hoyo ${activeHole}`}
                  className="rounded-md border border-orange-400/50 bg-orange-950/80 px-2 py-0.5 text-[10px] font-black leading-tight text-orange-100 shadow-lg backdrop-blur-sm active:scale-95"
                >
                  Corregir hoyo
                </button>
              ) : null}
              {holeCorrectionMode && resumeHole != null ? (
                <>
                  <button
                    type="button"
                    onClick={removeLastShotOnActiveHole}
                    disabled={
                      !hasRemovableShotsOnHole(holeShotsStore, activeHole)
                    }
                    aria-label="Quitar último golpe"
                    className="rounded-md border border-red-400/50 bg-red-950/80 px-2 py-0.5 text-[10px] font-black leading-tight text-red-100 shadow-lg backdrop-blur-sm active:scale-95 disabled:opacity-40"
                  >
                    ✕ Último golpe
                  </button>
                  <button
                    type="button"
                    onClick={returnToResumeHole}
                    aria-label={`Volver al hoyo ${resumeHole}`}
                    className="rounded-md border border-emerald-400/50 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-black leading-tight text-emerald-100 shadow-lg backdrop-blur-sm active:scale-95"
                  >
                    Volver al hoyo {resumeHole}
                  </button>
                </>
              ) : null}
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
            {(holeStrokeCount > 0 || pendingShot) && !farFromCourse ? (
              <button
                type="button"
                onClick={() => setShotsDetailOpen((o) => !o)}
                className="rounded-md border border-white/25 bg-black/60 px-2 py-1 text-[10px] font-black text-amber-200 shadow-lg backdrop-blur-sm active:scale-95"
              >
                Golpes
                <span className="ml-0.5 text-emerald-300">
                  {holeStrokeCount}
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

      {shotPlanOpen &&
      planContext &&
      !farFromCourse &&
      hasTeeMark &&
      !pendingWaterDrop &&
      !pendingShot ? (
        <ShotPlanPanel
          key={`plan-${activeHole}-${planSession}-${planContext.yardsToGreen}-${planContext.lieKind}`}
          bag={bag}
          yardsToGreen={planContext.yardsToGreen}
          greenDist={planContext.greenDist}
          lieKind={planContext.lieKind}
          onGreen={planContext.onGreen}
          inBunker={planContext.inBunker}
          onConfirm={handleConfirmPlan}
          onPreviewChange={handleShotPreviewChange}
          onAddPenalty={handleAddPenalty}
          onCancel={() => {
            setShotPlanOpen(false);
            setPlanContext(null);
            setShotPreview(null);
          }}
          onCorrectLastLanding={
            lastCompletedShotOnHole && !pendingShot
              ? () => correctLastShotLanding()
              : undefined
          }
        />
      ) : null}

      {/* Barra superior de yardas removida: la info al green (ENT/CEN/FON)
          ya se muestra en la parte inferior. */}

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
          <p className="mt-4 text-sm text-slate-300">
            Puedes probar Yardas desde casa:
          </p>
          <Link
            href={pruebaHref}
            className="mt-3 rounded-xl border border-emerald-500/50 bg-emerald-950/90 px-4 py-3 text-sm font-bold text-emerald-100 shadow-lg active:scale-[0.98]"
          >
            🏠 Probar en casa
          </Link>
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
