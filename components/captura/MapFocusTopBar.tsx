"use client";

interface MapFocusTopBarProps {
  /** Yardas al centro del green desde el punto marcado. */
  greenCenterYards: number;
  /** Yardas desde el ancla hasta el punto (opcional). */
  segmentYards?: number | null;
  segmentLabel?: string;
  demoMode?: boolean;
}

/** Barra superior compacta al marcar un punto en el mapa. */
export function MapFocusTopBar({
  greenCenterYards,
  segmentYards,
  segmentLabel,
  demoMode,
}: MapFocusTopBarProps) {
  return (
    <div
      className={[
        "pointer-events-none absolute inset-x-2 z-[1000] flex justify-center",
        demoMode ? "top-[2.65rem]" : "top-2",
      ].join(" ")}
    >
      <div className="flex max-w-md items-center gap-2 rounded-full border border-white/20 bg-black/75 px-3 py-1 shadow-lg backdrop-blur-md">
        <div className="text-center">
          <div className="text-[8px] font-bold uppercase tracking-wide text-emerald-400/90">
            Al green
          </div>
          <div className="text-base font-black leading-none text-white">
            {greenCenterYards}
            <span className="ml-0.5 text-[10px] font-bold text-slate-300">yds</span>
          </div>
        </div>
        {segmentYards != null && segmentYards > 0 ? (
          <>
            <div className="h-6 w-px bg-white/15" />
            <div className="text-center">
              <div className="text-[8px] font-bold uppercase tracking-wide text-pink-300/90">
                {segmentLabel ?? "Tramo"}
              </div>
              <div className="text-sm font-black leading-none text-pink-100">
                {segmentYards}
                <span className="ml-0.5 text-[9px] font-semibold text-pink-200/80">
                  yds
                </span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
