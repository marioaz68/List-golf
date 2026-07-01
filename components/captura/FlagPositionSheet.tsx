"use client";

import { useEffect, useState } from "react";
import { normalizeGreenDiagram } from "@/lib/flags/greenDiagram";

interface Props {
  hole: number;
  courseId: string;
  onClose: () => void;
}

type LL = { lat: number; lon: number };
interface ViewData {
  greenCenter: LL | null;
  greenFront: LL | null;
  greenBack: LL | null;
  greenRing: LL[] | null;
  flag: {
    lat: number;
    lon: number;
    color: string | null;
    side: string | null;
    depth_yards: number | null;
    edge_yards: number | null;
  } | null;
}

const VIEW_W = 260;
const VIEW_H = 320;
const COLOR_DOT: Record<string, string> = {
  roja: "#ef4444",
  blanca: "#e5e7eb",
  azul: "#3b82f6",
};

/** Hoja emergente que muestra la posición de la bandera del hoyo (referencia). */
export function FlagPositionSheet({ hole, courseId, onClose }: Props) {
  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const res = await fetch(
          `/api/captura/banderas/view?hole=${hole}&course_id=${encodeURIComponent(courseId)}`,
          { cache: "no-store" }
        );
        const d = (await res.json()) as ViewData & { ok: boolean; error?: string };
        if (cancelled) return;
        if (!d.ok) {
          setErr(d.error || "No se pudo cargar.");
          setData(null);
        } else {
          setData(d);
        }
      } catch {
        if (!cancelled) setErr("Error de red.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hole, courseId]);

  const diagram =
    data?.greenFront && data.greenBack && data.greenCenter
      ? normalizeGreenDiagram({
          front: data.greenFront,
          back: data.greenBack,
          center: data.greenCenter,
          ring: data.greenRing,
          flag: data.flag ? { lat: data.flag.lat, lon: data.flag.lon } : null,
          width: VIEW_W,
          height: VIEW_H,
        })
      : null;

  const flag = data?.flag ?? null;
  const dot = flag?.color ? COLOR_DOT[flag.color] ?? "#f59e0b" : "#f59e0b";
  const refText = flag
    ? `${flag.color ? flag.color[0].toUpperCase() + flag.color.slice(1) : "Bandera"}` +
      (flag.depth_yards != null
        ? ` · ${flag.depth_yards} yds del ${flag.color === "azul" ? "fondo" : "frente"}`
        : "") +
      (flag.edge_yards != null && flag.side
        ? ` · ${flag.edge_yards} yds de orilla ${flag.side === "left" ? "izq" : "der"}`
        : "")
    : null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[1130] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-amber-400/50 bg-slate-950 px-4 py-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-black text-amber-200">🚩 Bandera · Hoyo {hole}</p>
          <button onClick={onClose} className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-200">
            Cerrar
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
        ) : err ? (
          <p className="py-8 text-center text-sm text-amber-200">{err}</p>
        ) : !flag ? (
          <p className="py-8 text-center text-sm text-slate-300">
            Este hoyo aún no tiene bandera registrada hoy. Se usa el centro del green.
          </p>
        ) : (
          <>
            <div className="flex justify-center">
              <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full max-w-[260px]" role="img" aria-label="Posición de la bandera">
                <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#0b1220" rx="12" />
                {diagram?.ok && diagram.ringPoints ? (
                  <polygon points={diagram.ringPoints} fill="#14532d" stroke="#4ade80" strokeWidth="2" />
                ) : (
                  <ellipse cx={VIEW_W / 2} cy={VIEW_H / 2} rx={VIEW_W / 3} ry={VIEW_H / 3} fill="#14532d" stroke="#4ade80" strokeWidth="2" />
                )}
                <text x={VIEW_W / 2} y={VIEW_H - 6} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="bold">FRENTE (entrada)</text>
                <text x={VIEW_W / 2} y={14} textAnchor="middle" fontSize="11" fill="#94a3b8" fontWeight="bold">ATRÁS</text>
                {diagram?.flag ? (
                  <g>
                    <circle cx={diagram.flag.x} cy={diagram.flag.y} r="6" fill={dot} stroke="#000" strokeWidth="1" />
                    <line x1={diagram.flag.x} y1={diagram.flag.y} x2={diagram.flag.x} y2={diagram.flag.y - 16} stroke="#000" strokeWidth="1.5" />
                    <polygon points={`${diagram.flag.x},${diagram.flag.y - 16} ${diagram.flag.x + 10},${diagram.flag.y - 13} ${diagram.flag.x},${diagram.flag.y - 10}`} fill={dot} />
                  </g>
                ) : null}
              </svg>
            </div>
            {refText ? (
              <p className="mt-2 text-center text-xs font-semibold text-amber-100">{refText}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
