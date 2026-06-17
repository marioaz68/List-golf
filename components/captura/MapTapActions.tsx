"use client";

interface MapTapActionsProps {
  onDistance: () => void;
  onShot: () => void;
  onCancel: () => void;
}

/** Botones D / G al tocar el mapa (demo golpes). */
export function MapTapActions({
  onDistance,
  onShot,
  onCancel,
}: MapTapActionsProps) {
  return (
    <div className="pointer-events-auto flex items-center justify-center gap-2">
      <button
        type="button"
        onClick={onDistance}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-sky-400/50 bg-sky-950/90 text-sm font-black text-sky-200 shadow-lg active:scale-95"
        aria-label="Distancia"
      >
        D
      </button>
      <button
        type="button"
        onClick={onShot}
        className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-400/50 bg-emerald-950/90 text-sm font-black text-emerald-200 shadow-lg active:scale-95"
        aria-label="Golpe"
      >
        G
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[10px] font-bold text-slate-400"
        aria-label="Cancelar"
      >
        ✕
      </button>
    </div>
  );
}
