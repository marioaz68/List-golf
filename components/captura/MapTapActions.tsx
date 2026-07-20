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
    <div className="pointer-events-auto flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onDistance}
        className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-sky-400/60 bg-sky-950/90 text-3xl font-black text-sky-200 shadow-xl active:scale-95"
        aria-label="Distancia"
      >
        D
      </button>
      <button
        type="button"
        onClick={onShot}
        className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-emerald-400/60 bg-emerald-950/90 text-3xl font-black text-emerald-200 shadow-xl active:scale-95"
        aria-label="Golpe"
      >
        G
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-black/70 text-base font-bold text-slate-300"
        aria-label="Cancelar"
      >
        ✕
      </button>
    </div>
  );
}
