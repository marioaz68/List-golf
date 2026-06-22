"use client";

import { useMemo } from "react";
import { yardRangeValues } from "@/lib/distances/clubCatalog";
import { VerticalRoller } from "@/components/captura/VerticalRoller";

interface GreenPuttDistancePanelProps {
  puttYards: number;
  measuredYards: number;
  mode: "landing" | "relocate";
  onPuttYardsChange: (yards: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Tras tocar el green: confirma yardas al hoyo (rodillo 1 yd). */
export function GreenPuttDistancePanel({
  puttYards,
  measuredYards,
  mode,
  onPuttYardsChange,
  onConfirm,
  onCancel,
}: GreenPuttDistancePanelProps) {
  const maxYards = Math.max(60, measuredYards + 15);
  const yardValues = useMemo(
    () => yardRangeValues(1, maxYards, 1),
    [maxYards]
  );
  const yardLabels = useMemo(
    () => yardValues.map((y) => String(y)),
    [yardValues]
  );

  return (
    <div className="pointer-events-auto w-full max-w-sm rounded-xl border-2 border-cyan-400/55 bg-cyan-950/98 px-4 py-3 shadow-2xl backdrop-blur-md">
      <p className="text-center text-xs font-black text-cyan-50">
        {mode === "landing"
          ? "¿A cuántas yardas quedaste?"
          : "Ajusta yardas al hoyo"}
      </p>
      <p className="mt-1 text-center text-[10px] font-medium text-cyan-200/90">
        Tocaste ~{measuredYards} yds · la línea se ajusta al valor que elijas
      </p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <div className="rounded-lg border border-white/15 bg-black/80 p-1">
          <VerticalRoller
            className="h-[6.5rem] w-[3.25rem]"
            values={yardLabels}
            value={String(puttYards)}
            onChange={(s) => {
              const n = Number(s);
              if (Number.isFinite(n)) onPuttYardsChange(n);
            }}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-cyan-300/80">
            al hoyo
          </span>
          <span className="text-3xl font-black tabular-nums text-cyan-100">
            {puttYards}
          </span>
          <span className="text-[10px] font-bold text-cyan-300/70">yds</span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-white/20 bg-black/50 px-3 py-2.5 text-[11px] font-bold text-slate-300 active:scale-[0.98]"
        >
          Cancelar
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-[1.4] rounded-lg bg-cyan-600 px-3 py-2.5 text-xs font-black text-white active:scale-[0.98]"
        >
          Confirmar
        </button>
      </div>
    </div>
  );
}
