"use client";

interface MapFocusTopBarProps {
  greenCenterYards: number;
  positionLabel: string;
  demoMode?: boolean;
}

/** Pill superior: yardas al centro del green desde donde juegas. */
export function MapFocusTopBar({
  greenCenterYards,
  positionLabel,
  demoMode,
}: MapFocusTopBarProps) {
  return (
    <div
      className={[
        "pointer-events-none absolute left-1/2 z-[1000] -translate-x-1/2",
        demoMode ? "top-[2.65rem]" : "top-2",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 rounded-full border border-emerald-500/40 bg-black/80 px-3 py-0.5 shadow-lg backdrop-blur-md">
        <span className="text-[9px] font-semibold text-slate-400">{positionLabel}</span>
        <span className="text-[9px] font-bold uppercase text-emerald-400/90">
          al green
        </span>
        <span className="text-lg font-black leading-none text-white">
          {greenCenterYards}
          <span className="ml-0.5 text-[10px] font-bold text-slate-300">yds</span>
        </span>
      </div>
    </div>
  );
}
