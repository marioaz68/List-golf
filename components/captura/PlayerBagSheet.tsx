"use client";

import { CLUB_CATALOG, type ClubCategory } from "@/lib/distances/clubCatalog";
import {
  defaultPlayerBag,
  savePlayerBag,
  type PlayerBag,
  type PlayerBagClub,
} from "@/lib/distances/playerBag";

const CATEGORY_LABEL: Record<ClubCategory, string> = {
  wood: "Maderas",
  hybrid: "Híbridos",
  iron: "Hierros",
  wedge: "Cuñas",
  putter: "Putter",
};

interface PlayerBagSheetProps {
  open: boolean;
  bag: PlayerBag;
  onChange: (bag: PlayerBag) => void;
  onClose: () => void;
}

export function PlayerBagSheet({
  open,
  bag,
  onChange,
  onClose,
}: PlayerBagSheetProps) {
  if (!open) return null;

  const updateClub = (catalogId: string, patch: Partial<PlayerBagClub>) => {
    onChange({
      ...bag,
      clubs: bag.clubs.map((c) =>
        c.catalogId === catalogId ? { ...c, ...patch } : c
      ),
    });
  };

  const enabledCount = bag.clubs.filter((c) => c.enabled).length;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[1050] flex flex-col justify-end bg-black/50">
      <button
        type="button"
        aria-label="Cerrar"
        className="min-h-0 flex-1"
        onClick={onClose}
      />
      <div className="max-h-[70dvh] overflow-hidden rounded-t-2xl border-t border-slate-700 bg-slate-950 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-black text-white">Mi bolsa</h2>
            <p className="text-[11px] text-slate-400">
              Todos los bastones · activa los que llevas ({enabledCount})
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              const fresh = defaultPlayerBag();
              onChange(fresh);
              savePlayerBag(fresh);
            }}
            className="text-[11px] font-semibold text-amber-400"
          >
            Restablecer
          </button>
        </div>
        <div className="overflow-y-auto px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
          {(
            ["wood", "hybrid", "iron", "wedge", "putter"] as ClubCategory[]
          ).map((cat) => {
            const items = CLUB_CATALOG.filter((c) => c.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="mb-3">
                <div className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                  {CATEGORY_LABEL[cat]}
                </div>
                <div className="space-y-1">
                  {items.map((catEntry) => {
                    const row = bag.clubs.find(
                      (c) => c.catalogId === catEntry.id
                    );
                    if (!row) return null;
                    const isPutter = catEntry.defaultYardsFull <= 0;
                    return (
                      <div
                        key={catEntry.id}
                        className={[
                          "flex items-center gap-2 rounded-lg border px-2 py-1.5",
                          row.enabled
                            ? "border-emerald-800/60 bg-slate-900"
                            : "border-slate-800 bg-slate-900/40 opacity-60",
                        ].join(" ")}
                      >
                        <label className="flex min-w-0 flex-1 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.enabled}
                            onChange={(e) =>
                              updateClub(catEntry.id, {
                                enabled: e.target.checked,
                              })
                            }
                            className="h-4 w-4 shrink-0 accent-emerald-500"
                          />
                          <span className="truncate text-xs font-bold text-white">
                            {catEntry.label}
                          </span>
                        </label>
                        {!isPutter ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <YardInput
                              label="F"
                              value={row.yardsFull}
                              onChange={(v) =>
                                updateClub(catEntry.id, { yardsFull: v })
                              }
                            />
                            <YardInput
                              label="¾"
                              value={row.yardsThreeQuarter}
                              onChange={(v) =>
                                updateClub(catEntry.id, {
                                  yardsThreeQuarter: v,
                                })
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="border-t border-slate-800 px-4 py-3">
          <button
            type="button"
            onClick={() => {
              savePlayerBag(bag);
              onClose();
            }}
            className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-black text-white active:scale-[0.98]"
          >
            Guardar bolsa
          </button>
        </div>
      </div>
    </div>
  );
}

function YardInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[8px] font-bold text-slate-500">{label}</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        max={350}
        value={value || ""}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0);
        }}
        className="w-11 rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-center text-xs font-bold text-white"
      />
    </div>
  );
}
