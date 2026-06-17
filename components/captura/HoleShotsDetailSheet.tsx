"use client";

import {
  plannedVsActualDelta,
  shotClubLabel,
  shotsForHole,
  type HoleShotsStore,
} from "@/lib/distances/holeShots";

interface HoleShotsDetailSheetProps {
  open: boolean;
  hole: number;
  store: HoleShotsStore;
  onClose: () => void;
}

export function HoleShotsDetailSheet({
  open,
  hole,
  store,
  onClose,
}: HoleShotsDetailSheetProps) {
  if (!open) return null;

  const shots = shotsForHole(store, hole);
  const completed = shots.filter((s) => s.completedAt != null);

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-24 z-[1040] max-h-[40dvh] overflow-hidden rounded-xl border border-slate-600 bg-slate-950/95 shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
        <h3 className="text-xs font-black text-white">
          Golpes · Hoyo {hole}
          {completed.length > 0 ? (
            <span className="ml-1 text-emerald-400">({completed.length})</span>
          ) : null}
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs font-bold text-slate-400"
        >
          ✕
        </button>
      </div>
      <div className="overflow-y-auto px-3 py-2">
        {shots.length === 0 ? (
          <p className="text-center text-[11px] text-slate-500">
            Sin golpes anotados en este hoyo.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {shots.map((s) => {
              const delta = plannedVsActualDelta(s);
              const pending = s.completedAt == null;
              return (
                <li
                  key={s.id}
                  className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-1.5 text-[11px]"
                >
                  <div className="font-bold text-white">
                    {s.strokeNo}. {shotClubLabel(s.catalogId, s.swing)}
                  </div>
                  <div className="text-slate-400">
                    Plan:{" "}
                    <span className="font-semibold text-amber-200">
                      {s.plannedYards}
                    </span>
                    {pending ? (
                      <span className="ml-1 text-amber-400">· pendiente</span>
                    ) : (
                      <>
                        {" "}
                        → Ejec:{" "}
                        <span className="font-semibold text-emerald-300">
                          {s.actualYards}
                        </span>
                        {delta != null ? (
                          <span
                            className={
                              delta >= 0 ? "text-sky-400" : "text-rose-400"
                            }
                          >
                            {" "}
                            ({delta >= 0 ? "+" : ""}
                            {delta})
                          </span>
                        ) : null}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
