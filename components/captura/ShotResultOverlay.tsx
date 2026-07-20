"use client";

import { CLUB_BY_ID } from "@/lib/distances/clubCatalog";

interface ShotResultOverlayProps {
  catalogId: string;
  planned: number;
  actual: number;
  strokeNo: number;
  onClose: () => void;
}

/** Pantalla B: comparativo informativo del tiro recién marcado (plan vs real). */
export function ShotResultOverlay({
  catalogId,
  planned,
  actual,
  strokeNo,
  onClose,
}: ShotResultOverlayProps) {
  const club = CLUB_BY_ID[catalogId]?.shortLabel ?? catalogId;
  const diff = actual - planned;
  const absDiff = Math.abs(diff);
  const near = absDiff <= 5;
  const tone = near ? "#34d399" : diff < 0 ? "#fbbf24" : "#60a5fa";
  const verdict = near
    ? "Clavaste tu distancia"
    : diff < 0
      ? `Te quedaste corto ${absDiff} yd`
      : `Te pasaste ${absDiff} yd`;

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[1080] flex items-center justify-center bg-black/60 px-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-3xl border border-white/15 bg-slate-950 p-5 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
          Golpe {strokeNo} · {club}
        </div>
        <div className="mt-4 flex items-stretch justify-center gap-3">
          <div className="flex-1 rounded-2xl bg-white/5 py-3">
            <div className="text-[10px] font-bold uppercase text-slate-400">Plan</div>
            <div className="text-3xl font-black text-white">{planned}</div>
            <div className="text-[10px] text-slate-500">yd</div>
          </div>
          <div className="flex-1 rounded-2xl bg-white/5 py-3">
            <div className="text-[10px] font-bold uppercase text-slate-400">Real</div>
            <div className="text-3xl font-black text-white">{actual}</div>
            <div className="text-[10px] text-slate-500">yd</div>
          </div>
        </div>
        <div className="mt-3 text-lg font-black" style={{ color: tone }}>
          {diff > 0 ? "+" : ""}
          {diff} yd
        </div>
        <div className="mt-1 text-xs font-semibold text-slate-300">{verdict}</div>
        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-2xl bg-emerald-600 py-3 text-base font-black text-white active:scale-95"
        >
          Enterado
        </button>
      </div>
    </div>
  );
}
