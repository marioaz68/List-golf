"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { computeAllHoleDistances } from "@/lib/distances/ccqGreens";
import {
  CCQ_HOLE_POINTS,
  greenDistances,
  referenceDistances,
  yardsBetween,
  type ReferencePoint,
} from "@/lib/distances/ccqHolePoints";
import { defaultDistanciasCourseId } from "@/lib/distances/loadCourseReferencePoints";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import type { TapPoint } from "@/components/captura/HoleYardageMap";

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

export default function DistanciasClient() {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [manualHole, setManualHole] = useState<number | null>(null);
  const [tapPoint, setTapPoint] = useState<TapPoint | null>(null);
  const [customPoints, setCustomPoints] = useState<ReferencePoint[]>([]);
  const [pace, setPace] = useState<PaceState | null>(null);
  const watchIdRef = useRef<number | null>(null);

  const searchParams = useSearchParams();
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
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeo({
        status: "error",
        message: "Este dispositivo no expone GPS al navegador.",
      });
      return;
    }
    setGeo({ status: "requesting" });
    const id = navigator.geolocation.watchPosition(
      (pos) =>
        setGeo({
          status: "ok",
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 0,
          ts: Date.now(),
        }),
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
  }, []);

  const detectedHole = useMemo(() => {
    if (geo.status !== "ok") return null;
    return detectHole({ lat: geo.lat, lon: geo.lon }, CCQ_HOLES);
  }, [geo]);

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
    geo.status === "ok" &&
    nearest != null &&
    nearest.distanceMeters > MAX_DISTANCE_FROM_COURSE_M;

  const activeHole = manualHole ?? detectedHole ?? nearestHole;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/captura/distancias/points?hole=${activeHole}&course_id=${defaultDistanciasCourseId()}`
        );
        const data = (await res.json()) as {
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
        if (cancelled || !data.ok || !data.points) return;
        setCustomPoints(
          data.points.map((p) => ({
            id: p.id,
            label: p.label,
            shortLabel: p.short_label,
            lat: p.lat,
            lon: p.lon,
            kind: "custom" as const,
            dbKind: p.kind,
          }))
        );
      } catch {
        if (!cancelled) setCustomPoints([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeHole]);

  const greenYds = useMemo(() => {
    if (geo.status !== "ok") return null;
    return greenDistances(geo.lat, geo.lon, activeHole);
  }, [geo, activeHole]);

  const refPoints = useMemo(() => {
    if (geo.status !== "ok") return [];
    return referenceDistances(geo.lat, geo.lon, activeHole, customPoints);
  }, [geo, activeHole, customPoints]);

  const holeMeta = CCQ_HOLE_POINTS[activeHole];

  const onMapTap = useCallback(
    (lat: number, lon: number) => {
      if (geo.status !== "ok") return;
      setTapPoint({
        lat,
        lon,
        yards: yardsBetween(geo.lat, geo.lon, lat, lon),
      });
    },
    [geo]
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
          detectedHole != null ? `&hole=${detectedHole}` : "";
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
  }, [actorQuery, detectedHole]);

  const changeHole = (delta: number) => {
    setManualHole(((prev) => {
      const base = prev ?? detectedHole ?? nearestHole;
      let next = base + delta;
      if (next < 1) next = 18;
      if (next > 18) next = 1;
      return next;
    })());
    setTapPoint(null);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-slate-100">
      {/* Mapa a pantalla completa */}
      <div className="absolute inset-0">
        {geo.status === "ok" && greenYds && !farFromCourse ? (
          <HoleYardageMap
            holeNo={activeHole}
            playerLat={geo.lat}
            playerLon={geo.lon}
            yardsToCenter={greenYds.center}
            referencePoints={refPoints}
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

      {/* Barra superior flotante: hoyo + distancias + cerrar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-1.5 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-2 pb-6 pt-2">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => changeHole(-1)}
            aria-label="Hoyo anterior"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setManualHole(null)}
            disabled={manualHole == null}
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
            onClick={() => changeHole(1)}
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

        <Link
          href="/"
          className="pointer-events-auto rounded-md bg-black/55 px-2 py-1 text-sm font-bold backdrop-blur-sm"
        >
          ✕
        </Link>
      </div>

      {/* Punto tocado: pastilla flotante */}
      {tapPoint && !farFromCourse ? (
        <button
          type="button"
          onClick={() => setTapPoint(null)}
          className="absolute left-1/2 top-16 z-[1000] -translate-x-1/2 rounded-full bg-pink-600/90 px-3 py-1 text-xs font-black text-white shadow-lg backdrop-blur-sm"
        >
          {tapPoint.yards} yds · tocar para quitar
        </button>
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

      {/* Barra de ritmo delgada abajo */}
      {!farFromCourse ? <PaceBannerThin pace={pace} /> : null}
    </div>
  );
}

function PaceBannerThin({ pace }: { pace: PaceState | null }) {
  if (!pace || pace.color === "none" || pace.deltaMinutes == null) return null;
  const style = PACE_STYLE[pace.color];
  const mins = Math.abs(Math.round(pace.deltaMinutes));
  const detail =
    pace.color === "blue"
      ? `${mins} min más rápido`
      : pace.color === "green"
        ? `±${mins} min · vas bien`
        : `${mins} min más lento`;
  return (
    <div
      className={[
        "absolute inset-x-0 bottom-0 z-[1000] flex items-center justify-center gap-2 border-t-2 px-3 py-1.5 text-center shadow-lg",
        style.box,
      ].join(" ")}
    >
      <span
        className={["text-base font-black tracking-wide", style.label].join(" ")}
      >
        {style.title}
      </span>
      <span className={["text-xs font-bold", style.label].join(" ")}>
        · {detail}
      </span>
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
