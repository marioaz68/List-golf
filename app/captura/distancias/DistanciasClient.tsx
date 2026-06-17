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
import { waypointsFromLine } from "@/lib/distances/centerline";
import { resolveHoleGreenPoints } from "@/lib/distances/greenPoints";
import { defaultDistanciasCourseId } from "@/lib/distances/loadCourseReferencePoints";
import {
  buildCourseHolesCollection,
  parseBoundariesPayload,
} from "@/lib/distances/resolveCourseHoles";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import type { FeatureCollection, Polygon } from "@/lib/telegram/ritmo/geometry";
import type { TapPoint } from "@/components/captura/HoleYardageMap";
import { ClubSuggestionStrip } from "@/components/captura/ClubSuggestionStrip";
import { PlayerBagSheet } from "@/components/captura/PlayerBagSheet";
import type { SwingKind } from "@/lib/distances/clubCatalog";
import {
  defaultPlayerBag,
  getEnabledBagClubs,
  loadPlayerBag,
  savePlayerBag,
  type PlayerBag,
} from "@/lib/distances/playerBag";
import { suggestClub, yardsRollerValues } from "@/lib/distances/suggestClub";

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
  const [swing, setSwing] = useState<SwingKind>("full");
  const [bagOpen, setBagOpen] = useState(false);
  const [bag, setBag] = useState<PlayerBag>(() => defaultPlayerBag());
  const [customPoints, setCustomPoints] = useState<ReferencePoint[]>([]);
  const [holeGreen, setHoleGreen] = useState<HoleGreenPoints | null>(null);
  const [pace, setPace] = useState<PaceState | null>(null);
  const [courseHoles, setCourseHoles] =
    useState<FeatureCollection<Polygon, { hoyo: number }>>(CCQ_HOLES);
  const [boundaryByHole, setBoundaryByHole] = useState<
    Map<number, Polygon>
  >(() => new Map());
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
  }, [bagScope]);

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

  useEffect(() => {
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

  const activeHolePoints = holeGreen ?? CCQ_HOLE_POINTS[activeHole];

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
    if (geo.status !== "ok" || !activeHolePoints) return null;
    return greenDistancesForHole(geo.lat, geo.lon, activeHolePoints);
  }, [geo, activeHolePoints]);

  const refPoints = useMemo(() => {
    if (geo.status !== "ok" || !activeHolePoints) return [];
    return referenceDistancesForHole(
      geo.lat,
      geo.lon,
      activeHolePoints,
      customPoints
    );
  }, [geo, activeHolePoints, customPoints]);

  const holeMeta = activeHolePoints;

  const onMapTap = useCallback(
    (lat: number, lon: number) => {
      if (geo.status !== "ok" || !activeHolePoints) return;
      const toGreen = greenDistancesForHole(lat, lon, activeHolePoints);
      setTapPoint({
        lat,
        lon,
        yards: yardsBetween(geo.lat, geo.lon, lat, lon),
      });
      setTargetYards(toGreen.center);
      setSwing("full");
    },
    [geo, activeHolePoints]
  );

  const tapGreenYards = useMemo(() => {
    if (!tapPoint || !activeHolePoints) return null;
    return greenDistancesForHole(
      tapPoint.lat,
      tapPoint.lon,
      activeHolePoints
    );
  }, [tapPoint, activeHolePoints]);

  const clubSuggestion = useMemo(() => {
    if (!tapPoint || targetYards <= 0) return null;
    return suggestClub(getEnabledBagClubs(bag), targetYards, swing);
  }, [bag, tapPoint, targetYards, swing]);

  const rollerValues = useMemo(() => {
    const base = tapGreenYards?.center ?? 0;
    if (base <= 0) return [];
    return yardsRollerValues(base);
  }, [tapGreenYards?.center]);

  const clearTap = useCallback(() => {
    setTapPoint(null);
    setTargetYards(0);
  }, []);

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

  // Avanzar manualmente: SOLO ascendente (envuelve 18→1). No se puede
  // retroceder de hoyo; para reiniciar usa "Salir en 1 / 10".
  const nextHole = () => {
    manualAtDetectedRef.current = insideHole;
    setManualHole((prev) => {
      const base = prev ?? autoHole ?? nearestHole;
      return (base % 18) + 1;
    });
    setTapPoint(null);
    setTargetYards(0);
    if (demoMode) setDemoProgress(0.35);
  };

  const startAtHole = (n: number) => {
    manualAtDetectedRef.current = insideHole;
    autoCandidateRef.current = { hole: 0, count: 0 };
    setManualHole(n);
    setTapPoint(null);
    setTargetYards(0);
    if (demoMode) setDemoProgress(0.35);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-slate-100">
      {/* Mapa a pantalla completa */}
      <div className="absolute inset-0">
        {geo.status === "ok" && greenYds && !farFromCourse ? (
          <HoleYardageMap
            holeNo={activeHole}
            par={holeMeta?.par ?? 4}
            playerLat={geo.lat}
            playerLon={geo.lon}
            yardsToCenter={greenYds.center}
            referencePoints={refPoints}
            holeBoundary={boundaryByHole.get(activeHole) ?? null}
            centerline={centerlines[activeHole] ?? null}
            tapPoint={tapPoint}
            onMapTap={onMapTap}
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

      {/* Controles abajo: selector de hoyo + distancias al green. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] flex flex-col items-stretch">
        {tapPoint && tapGreenYards && !farFromCourse ? (
          <ClubSuggestionStrip
            suggestion={clubSuggestion}
            swing={swing}
            onSwingChange={setSwing}
            rollerValues={rollerValues}
            targetYards={targetYards}
            onTargetYardsChange={setTargetYards}
            greenYards={tapGreenYards}
            onClear={clearTap}
          />
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
              onClick={() => setManualHole(null)}
              disabled={manualHole == null || demoMode}
              aria-label="Volver a detección automática"
              className="rounded-md bg-black/60 px-2 py-0.5 text-center leading-none shadow-lg backdrop-blur-sm disabled:opacity-100"
            >
              <div className="text-xs font-black text-emerald-100">
                H{activeHole}
                <span className="ml-1 text-[9px] font-semibold text-slate-300">
                  par {holeMeta?.par ?? "—"}
                </span>
              </div>
              {manualHole != null ? (
                <div className="text-[8px] text-slate-300">tocar para auto</div>
              ) : null}
            </button>
            <button
              type="button"
              onClick={nextHole}
              aria-label="Hoyo siguiente"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
            >
              ›
            </button>
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

      {/* Distancia desde tu posición hasta el punto tocado (referencia). */}
      {tapPoint && !farFromCourse ? (
        <div className="absolute left-1/2 top-11 z-[1000] -translate-x-1/2 rounded-full bg-pink-600/90 px-3 py-1 text-[11px] font-bold text-white shadow-lg backdrop-blur-sm">
          {tapPoint.yards} yds desde ti
        </div>
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
