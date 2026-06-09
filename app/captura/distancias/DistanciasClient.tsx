"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  CCQ_GREEN_CENTERS,
  computeAllHoleDistances,
  type DistanceToHole,
} from "@/lib/distances/ccqGreens";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; lat: number; lon: number; accuracy: number; ts: number };

function formatYds(yd: number): string {
  return `${Math.round(yd)}`;
}

function timeAgo(ms: number): string {
  const sec = Math.round((Date.now() - ms) / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  return `${Math.round(min / 60)}h`;
}

export default function DistanciasClient() {
  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const watchIdRef = useRef<number | null>(null);

  // Pedir GPS al cargar la página
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
              "Permiso de ubicación bloqueado. Habilita el GPS para esta página en los ajustes del navegador.",
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

  // Distancias calculadas en cliente cada vez que cambia la posición
  const distances: DistanceToHole[] = useMemo(() => {
    if (geo.status !== "ok") return [];
    return computeAllHoleDistances(geo.lat, geo.lon);
  }, [geo]);

  // Hoyo en el que está parado el jugador (según polígonos del CCQ)
  const currentHole = useMemo(() => {
    if (geo.status !== "ok") return null;
    return detectHole({ lat: geo.lat, lon: geo.lon }, CCQ_HOLES);
  }, [geo]);

  // Top 3 hoyos por proximidad (excluyendo el actual)
  const topNear = useMemo(() => {
    if (distances.length === 0) return [];
    return distances
      .filter((d) => d.holeNo !== currentHole)
      .slice(0, 3);
  }, [distances, currentHole]);

  const currentDistance = useMemo(() => {
    if (currentHole == null) return null;
    return distances.find((d) => d.holeNo === currentHole) ?? null;
  }, [distances, currentHole]);

  return (
    <div className="min-h-screen bg-slate-950 pb-8 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-bold">📏 Distancias · CCQ</h1>
          <Link
            href="/"
            className="text-[11px] font-semibold text-slate-400 underline"
          >
            cerrar
          </Link>
        </div>
        <p className="mt-0.5 text-[11px] text-slate-400">
          Distancia en yardas al centro del green
        </p>
      </header>

      {/* GPS status */}
      <section className="mx-3 mt-3 rounded-lg border border-slate-800 bg-slate-900 p-3">
        {geo.status === "idle" || geo.status === "requesting" ? (
          <p className="text-center text-sm text-slate-300">
            📡 Esperando posición GPS…
          </p>
        ) : geo.status === "denied" ? (
          <div className="text-center">
            <p className="text-sm font-bold text-amber-300">
              ⚠ {geo.message}
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              En iPhone: Ajustes → Safari → Ubicación → Permitir. En Android:
              candado en la barra → Permisos → Ubicación → Permitir.
            </p>
          </div>
        ) : geo.status === "error" ? (
          <p className="text-center text-sm text-red-300">
            ⚠ {geo.message}
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat label="GPS" value="✓" />
            <Stat
              label="Precisión"
              value={`${Math.round(geo.accuracy)}m`}
              warn={geo.accuracy > 25}
            />
            <Stat label="Última" value={timeAgo(geo.ts)} />
          </div>
        )}
      </section>

      {/* Hoyo actual */}
      {currentDistance ? (
        <section className="mx-3 mt-3 rounded-xl border-2 border-emerald-500 bg-gradient-to-br from-emerald-900/40 to-emerald-950/60 p-4">
          <div className="flex items-baseline justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-300">
              Estás en
            </div>
            <div className="text-[10px] text-emerald-400">
              par {currentDistance.par}
            </div>
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-3">
            <div className="text-5xl font-black text-emerald-100">
              Hoyo {currentDistance.holeNo}
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase text-emerald-300">
                Al green
              </div>
              <div className="text-4xl font-black text-emerald-100">
                {formatYds(currentDistance.distanceYards)}
              </div>
              <div className="text-[10px] text-emerald-300">yardas</div>
            </div>
          </div>
        </section>
      ) : geo.status === "ok" && currentHole == null ? (
        <section className="mx-3 mt-3 rounded-lg border border-amber-700 bg-amber-950/50 p-3 text-center text-[12px] text-amber-200">
          📍 No estás dentro de ningún polígono de hoyo del CCQ. ¿Vas caminando
          entre hoyos? Te muestro los más cercanos abajo.
        </section>
      ) : null}

      {/* Próximos hoyos por proximidad */}
      {topNear.length > 0 ? (
        <section className="mx-3 mt-3">
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Hoyos cercanos
          </h2>
          <div className="space-y-1.5">
            {topNear.map((d) => (
              <div
                key={d.holeNo}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900 px-3 py-2"
              >
                <div>
                  <div className="text-lg font-bold text-slate-100">
                    Hoyo {d.holeNo}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    par {d.par}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-slate-200">
                    {formatYds(d.distanceYards)}
                  </div>
                  <div className="text-[10px] text-slate-400">yardas</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {/* Tabla completa */}
      {distances.length > 0 ? (
        <section className="mx-3 mt-4">
          <h2 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Todos los hoyos
          </h2>
          <div className="overflow-hidden rounded-lg border border-slate-800 bg-slate-900">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-800/50 text-left text-[9px] uppercase text-slate-500">
                  <th className="px-2 py-1.5">Hoyo</th>
                  <th className="px-2 py-1.5">Par</th>
                  <th className="px-2 py-1.5 text-right">Yardas</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(CCQ_GREEN_CENTERS)
                  .map((k) => Number(k))
                  .sort((a, b) => a - b)
                  .map((n) => {
                    const d = distances.find((x) => x.holeNo === n);
                    const isCurrent = n === currentHole;
                    return (
                      <tr
                        key={n}
                        className={[
                          "border-b border-slate-800/60 last:border-b-0",
                          isCurrent ? "bg-emerald-900/40" : "",
                        ].join(" ")}
                      >
                        <td className="px-2 py-1.5 font-bold text-slate-200">
                          {n}
                          {isCurrent ? (
                            <span className="ml-1 text-[9px] text-emerald-400">
                              ●
                            </span>
                          ) : null}
                        </td>
                        <td className="px-2 py-1.5 text-slate-400">
                          {CCQ_GREEN_CENTERS[n].par}
                        </td>
                        <td className="px-2 py-1.5 text-right font-bold text-slate-100">
                          {d ? formatYds(d.distanceYards) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="mx-3 mt-4 text-center text-[10px] text-slate-600">
        Distancia al centro del green. Para acercamientos cortos, considera
        el viento y la elevación.
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-md bg-slate-800/60 px-1.5 py-1">
      <div className="text-[9px] font-bold uppercase text-slate-400">{label}</div>
      <div
        className={[
          "text-sm font-bold",
          warn ? "text-amber-300" : "text-slate-100",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
