"use client";

import { puttYardsFromCenter } from "@/lib/distances/holeComplete";

interface MapFocusTopBarProps {
  greenCenterYards: number;
  positionLabel: string;
  onGreen?: boolean;
  demoMode?: boolean;
}

/** Pill superior: yardas al green/hoyo desde donde juegas.
 *  (El lie —fairway/rough/bunker— ya se muestra en la parte inferior.) */
export function MapFocusTopBar({
  greenCenterYards,
  positionLabel,
  onGreen = false,
  demoMode,
}: MapFocusTopBarProps) {
  const displayYards = onGreen
    ? puttYardsFromCenter(greenCenterYards)
    : greenCenterYards;

  return (
    <div
      className={[
        "pointer-events-none absolute left-1/2 z-[1000] -translate-x-1/2",
        demoMode ? "top-[2.65rem]" : "top-2",
      ].join(" ")}
    >
      <div className="flex max-w-[min(100vw-1rem,22rem)] flex-col items-center gap-1">
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-black/85 px-3 py-1 shadow-lg backdrop-blur-md">
          <span className="text-[9px] font-semibold text-slate-400">
            {positionLabel}
          </span>
          <span className="text-[9px] font-bold uppercase text-emerald-400/90">
            {onGreen ? "al hoyo" : "al centro"}
          </span>
          <span className="text-lg font-black leading-none text-white">
            {displayYards}
            <span className="ml-0.5 text-[10px] font-bold text-slate-300">yds</span>
          </span>
        </div>
      </div>
    </div>
  );
}
