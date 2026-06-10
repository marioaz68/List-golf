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
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="shrink-0 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h1 className="text-sm font-bold">📏 Yardas · CCQ</h1>
            <p className="text-[10px] text-slate-400">
              Mapa del campo · misma base que ritmo del campo
            </p>
          </div>
          <Link
            href="/"
            className="text-[11px] font-semibold text-slate-400 underline"
          >
            cerrar
          </Link>
        </div>
      </header>

      {/* GPS */}
      <section className="shrink-0 border-b border-slate-800 px-3 py-2">
        {geo.status === "idle" || geo.status === "requesting" ? (
          <p className="text-center text-xs text-slate-300">
            📡 Esperando GPS…
          </p>
        ) : geo.status === "denied" || geo.status === "error" ? (
          <p className="text-center text-xs text-amber-300">
            ⚠ {geo.status === "denied" ? geo.message : geo.message}
          </p>
        ) : (
          <div className="flex items-center justify-between text-[10px] text-slate-400">
            <span>GPS ✓ · ±{Math.round(geo.accuracy)}m</span>
            <span>Hace {timeAgo(geo.ts)}</span>
            {farFromCourse ? (
              <span className="text-amber-300">Lejos del campo</span>
            ) : detectedHole == null ? (
              <span className="text-amber-300">Fuera de hoyo</span>
            ) : (
              <span className="text-emerald-400">Hoyo {detectedHole}</span>
            )}
          </div>
        )}
      </section>

      {/* Fuera del rango del club: no medimos */}
      {farFromCourse ? (
        <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
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
        </section>
      ) : (
      <>
      {/* Selector de hoyo + F/C/B */}
      <section className="shrink-0 border-b border-slate-800 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => changeHole(-1)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-bold"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="text-lg font-black text-emerald-100">
              Hoyo {activeHole}
            </div>
            <div className="text-[10px] text-slate-400">
              par {holeMeta?.par ?? "—"}
              {manualHole != null ? " · manual" : ""}
            </div>
          </div>
          <button
            type="button"
            onClick={() => changeHole(1)}
            className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-bold"
          >
            ›
          </button>
        </div>

        {greenYds ? (
          <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
            <GreenChip label="Frente" yards={greenYds.front} />
            <GreenChip label="Centro" yards={greenYds.center} highlight />
            <GreenChip label="Fondo" yards={greenYds.back} />
          </div>
        ) : null}
      </section>

      {/* Mapa */}
      <section className="min-h-0 flex-1 px-2 py-2">
        {geo.status === "ok" && greenYds ? (
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
          <MapSkeleton />
        )}
      </section>

      {/* Tap + puntos de referencia */}
      <section className="shrink-0 border-t border-slate-800 px-3 py-2 pb-4">
        {tapPoint ? (
          <div className="mb-2 flex items-center justify-between rounded-lg border border-pink-700/50 bg-pink-950/40 px-3 py-2">
            <div>
              <div className="text-[10px] font-bold uppercase text-pink-300">
                Punto tocado
              </div>
              <div className="text-2xl font-black text-pink-100">
                {tapPoint.yards}{" "}
                <span className="text-sm font-bold">yds</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTapPoint(null)}
              className="rounded-md border border-pink-600/50 px-2 py-1 text-[10px] text-pink-200"
            >
              Quitar
            </button>
          </div>
        ) : null}

        <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Puntos del hoyo
        </h2>
        <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
          {refPoints.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between rounded-md border border-slate-800 bg-slate-900 px-2 py-1.5"
            >
              <span className="truncate text-[11px] text-slate-300">
                {p.label}
              </span>
              <span className="ml-1 shrink-0 text-sm font-bold text-slate-100">
                {p.yards}
              </span>
            </div>
          ))}
        </div>

        <PaceBanner pace={pace} />
      </section>
      </>
      )}
    </div>
  );
}

function PaceBanner({ pace }: { pace: PaceState | null }) {
  if (!pace || pace.color === "none" || pace.deltaMinutes == null) return null;
  const style = PACE_STYLE[pace.color];
  const delta = pace.deltaMinutes;
  const mins = Math.abs(Math.round(delta));
  const detail =
    pace.color === "blue"
      ? `${mins} min más rápido que el ritmo`
      : pace.color === "green"
        ? `±${mins} min · vas bien`
        : `${mins} min más lento que el ritmo`;
  return (
    <div
      className={[
        "mt-3 rounded-xl border-2 px-4 py-3 text-center shadow-lg",
        style.box,
      ].join(" ")}
    >
      <div className={["text-3xl font-black tracking-wide", style.label].join(" ")}>
        {style.title}
      </div>
      <div className={["mt-0.5 text-sm font-bold", style.label].join(" ")}>
        {detail}
      </div>
      <div className={["mt-0.5 text-[10px] font-semibold uppercase opacity-80", style.label].join(" ")}>
        Ritmo del campo
      </div>
    </div>
  );
}

function GreenChip({
  label,
  yards,
  highlight,
}: {
  label: string;
  yards: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-lg border px-1 py-1.5",
        highlight
          ? "border-emerald-500 bg-emerald-900/50"
          : "border-slate-700 bg-slate-900",
      ].join(" ")}
    >
      <div className="text-[9px] font-bold uppercase text-slate-400">
        {label}
      </div>
      <div
        className={[
          "text-xl font-black",
          highlight ? "text-emerald-100" : "text-slate-200",
        ].join(" ")}
      >
        {yards}
      </div>
    </div>
  );
}
