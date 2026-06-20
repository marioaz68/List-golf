"use client";

interface MapZoomControlProps {
  percent: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  canZoomIn?: boolean;
  canZoomOut?: boolean;
}

/** +/− con porcentaje, esquina inferior derecha del mapa. */
export function MapZoomControl({
  percent,
  onZoomIn,
  onZoomOut,
  canZoomIn = true,
  canZoomOut = true,
}: MapZoomControlProps) {
  const stopMapTap = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      data-yardage-map-ui
      className="pointer-events-auto absolute bottom-[7rem] right-2 z-[1020] flex flex-col items-center gap-0.5 rounded-lg border border-white/20 bg-black/80 p-1 shadow-lg backdrop-blur-md"
      onPointerDown={stopMapTap}
      onClick={stopMapTap}
    >
      <button
        type="button"
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Acercar"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-lg font-black leading-none text-white active:scale-95 disabled:opacity-35"
      >
        +
      </button>
      <span className="min-w-[2.5rem] text-center text-[10px] font-bold tabular-nums text-slate-200">
        {percent}%
      </span>
      <button
        type="button"
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Alejar"
        className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10 text-lg font-black leading-none text-white active:scale-95 disabled:opacity-35"
      >
        −
      </button>
    </div>
  );
}
