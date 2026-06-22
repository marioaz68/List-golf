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
    <div className="pointer-events-auto w-[10.25rem] rounded-lg border border-cyan-400/50 bg-cyan-950/94 px-2 py-1.5 shadow-xl backdrop-blur-md">
      <p className="text-center text-[9px] font-black leading-tight text-cyan-50">
        {mode === "landing" ? "Yardas al hoyo" : "Ajustar putt"}
      </p>
      <p className="mt-0.5 text-center text-[8px] font-medium leading-tight text-cyan-200/80">
        Tocado ~{measuredYards} yds
      </p>
      <div className="mt-1 flex items-center justify-center gap-1.5">
        <div className="rounded-md border border-white/15 bg-black/80 p-0.5">
          <VerticalRoller
            className="h-[4.25rem] w-[2.35rem]"
            values={yardLabels}
            value={String(puttYards)}
            onChange={(s) => {
              const n = Number(s);
              if (Number.isFinite(n)) onPuttYardsChange(n);
            }}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[8px] font-semibold uppercase text-cyan-300/75">
            hoyo
          </span>
          <span className="text-xl font-black tabular-nums leading-none text-cyan-100">
            {puttYards}
          </span>
        </div>
      </div>
      <div className="mt-1.5 flex gap-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-md border border-white/20 bg-black/50 px-1.5 py-1 text-[9px] font-bold text-slate-300 active:scale-[0.98]"
        >
          ✕
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className="flex-[1.6] rounded-md bg-cyan-600 px-1.5 py-1 text-[9px] font-black text-white active:scale-[0.98]"
        >
          OK
        </button>
      </div>
    </div>
  );
}
