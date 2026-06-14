"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  CCQ_HOLE_POINTS,
  greenDistancesForHole,
  referenceDistancesForHole,
} from "@/lib/distances/ccqHolePoints";

function MapSkeleton() {
  return (
    <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-slate-400">
      Cargando mapa…
    </div>
  );
}

const HoleYardageMap = dynamic(
  () =>
    import("@/components/captura/HoleYardageMap").then((m) => m.HoleYardageMap),
  { ssr: false, loading: () => <MapSkeleton /> }
);

// Dos vueltas tipo shotgun: una por cada nueve. Cada vuelta tiene 9 paradas
// (una por green), en orden de juego con wrap 1..18.
const ROUTES: { id: number; label: string; holes: number[] }[] = [
  { id: 1, label: "Vuelta 1 · sale del 1", holes: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  {
    id: 2,
    label: "Vuelta 2 · sale del 10",
    holes: [10, 11, 12, 13, 14, 15, 16, 17, 18],
  },
];

export default function DistanciasDemoClient() {
  const [routeId, setRouteId] = useState(1);
  const [stopIdx, setStopIdx] = useState(0);
  // Progreso del tee (0) al green (1): simula caminar por el hoyo.
  const [progress, setProgress] = useState(0);

  const route = ROUTES.find((r) => r.id === routeId) ?? ROUTES[0];
  const holeNo = route.holes[Math.min(stopIdx, route.holes.length - 1)];
  const hp = CCQ_HOLE_POINTS[holeNo];

  // Posición simulada: interpola del tee al centro del green según el progreso.
  // A escala de un hoyo la interpolación lineal en lat/lon es suficiente.
  const player = useMemo(() => {
    if (!hp) return null;
    const t = Math.max(0, Math.min(1, progress));
    // 0 = en el tee; 0.92 = casi en el centro del green (deja algo de yardas).
    const f = t * 0.92;
    return {
      lat: hp.tee.lat + (hp.center.lat - hp.tee.lat) * f,
      lon: hp.tee.lon + (hp.center.lon - hp.tee.lon) * f,
    };
  }, [hp, progress]);

  const greenYds = useMemo(() => {
    if (!hp || !player) return null;
    return greenDistancesForHole(player.lat, player.lon, hp);
  }, [hp, player]);

  const refPoints = useMemo(() => {
    if (!hp || !player) return [];
    return referenceDistancesForHole(player.lat, player.lon, hp, []);
  }, [hp, player]);

  const goStop = (delta: number) => {
    setStopIdx((prev) => {
      let next = prev + delta;
      if (next < 0) next = 0;
      if (next > route.holes.length - 1) next = route.holes.length - 1;
      return next;
    });
    setProgress(0);
  };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-slate-100">
      {/* Mapa a pantalla completa */}
      <div className="absolute inset-0">
        {player && greenYds ? (
          <HoleYardageMap
            holeNo={holeNo}
            playerLat={player.lat}
            playerLon={player.lon}
            yardsToCenter={greenYds.center}
            referencePoints={refPoints}
            tapPoint={null}
          />
        ) : (
          <MapSkeleton />
        )}
      </div>

      {/* Barra superior: vuelta + hoyo + cerrar */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[1000] flex items-start justify-between gap-1.5 bg-gradient-to-b from-black/70 via-black/30 to-transparent px-2 pb-6 pt-2">
        <div className="pointer-events-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => goStop(-1)}
            disabled={stopIdx === 0}
            aria-label="Hoyo anterior"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95 disabled:opacity-40"
          >
            ‹
          </button>
          <div className="rounded-md bg-black/60 px-2 py-0.5 text-center leading-none shadow-lg backdrop-blur-sm">
            <div className="text-xs font-black text-emerald-100">
              H{holeNo}
              <span className="ml-1 text-[9px] font-semibold text-slate-300">
                par {hp?.par ?? "—"}
              </span>
            </div>
            <div className="text-[8px] text-slate-300">
              parada {stopIdx + 1}/{route.holes.length}
            </div>
          </div>
          <button
            type="button"
            onClick={() => goStop(1)}
            disabled={stopIdx === route.holes.length - 1}
            aria-label="Hoyo siguiente"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-black/60 text-2xl font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95 disabled:opacity-40"
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
          href="/captura/distancias"
          className="pointer-events-auto rounded-md bg-black/55 px-2 py-1 text-sm font-bold backdrop-blur-sm"
        >
          ✕
        </Link>
      </div>

      {/* Etiqueta de modo prueba */}
      <div className="pointer-events-none absolute left-1/2 top-16 z-[1000] -translate-x-1/2 rounded-full bg-amber-500/90 px-3 py-1 text-[11px] font-black text-amber-950 shadow-lg">
        MODO PRUEBA · sin GPS
      </div>

      {/* Controles inferiores: vuelta + caminar tee→green */}
      <div className="absolute inset-x-0 bottom-0 z-[1000] space-y-2 bg-gradient-to-t from-black/80 via-black/50 to-transparent px-3 pb-3 pt-6">
        <div className="flex justify-center gap-2">
          {ROUTES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => {
                setRouteId(r.id);
                setStopIdx(0);
                setProgress(0);
              }}
              className={[
                "rounded-full px-3 py-1 text-xs font-bold backdrop-blur-sm",
                r.id === routeId
                  ? "bg-emerald-600 text-white"
                  : "bg-black/55 text-slate-200",
              ].join(" ")}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="rounded-lg bg-black/55 px-3 py-2 backdrop-blur-sm">
          <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-300">
            <span>Tee</span>
            <span>Caminar por el hoyo ({Math.round(progress * 100)}%)</span>
            <span>Green</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(progress * 100)}
            onChange={(e) => setProgress(Number(e.target.value) / 100)}
            className="w-full accent-emerald-500"
          />
        </div>
      </div>
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
