"use client";

import { useState } from "react";
import { YardsRoller } from "@/components/captura/YardsRoller";
import {
  CLUB_CATALOG,
  clubYardPickerValues,
  type ClubCategory,
} from "@/lib/distances/clubCatalog";
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

const ALL_CATEGORIES = [
  "wood",
  "hybrid",
  "iron",
  "wedge",
  "putter",
] as const satisfies readonly ClubCategory[];

type YardField = "yardsFull" | "yardsThreeQuarter";

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
  const [filter, setFilter] = useState<ClubCategory | "all">("all");
  const [editing, setEditing] = useState<{
    catalogId: string;
    field: YardField;
  } | null>(null);

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
  const visibleCategories =
    filter === "all" ? ALL_CATEGORIES : ([filter] as const);

  return (
    <div className="pointer-events-auto absolute inset-0 z-[1050] flex items-end justify-center bg-black/40 p-2 pb-[max(8px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        aria-label="Cerrar"
        className="absolute inset-0"
        onClick={onClose}
      />
      <div className="relative flex max-h-[52dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
        <div className="shrink-0 border-b border-slate-800 px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-xs font-black text-white">Mi bolsa</h2>
              <p className="text-[10px] text-slate-400">
                {enabledCount} activos · yardas en saltos de 5
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const fresh = defaultPlayerBag();
                onChange(fresh);
                savePlayerBag(fresh);
                setEditing(null);
              }}
              className="shrink-0 text-[10px] font-semibold text-amber-400"
            >
              Restablecer
            </button>
          </div>
          <div className="mt-1.5 flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <FilterChip
              active={filter === "all"}
              label="Todos"
              onClick={() => setFilter("all")}
            />
            {ALL_CATEGORIES.map((cat) => (
              <FilterChip
                key={cat}
                active={filter === cat}
                label={CATEGORY_LABEL[cat]}
                onClick={() => setFilter(cat)}
              />
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-1">
          {visibleCategories.map((cat) => {
            const items = CLUB_CATALOG.filter((c) => c.category === cat);
            if (!items.length) return null;
            return (
              <div key={cat} className="mb-2">
                {filter === "all" ? (
                  <div className="sticky top-0 z-[1] mb-0.5 bg-slate-950/95 px-0.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                    {CATEGORY_LABEL[cat]}
                  </div>
                ) : null}
                <div className="space-y-0.5">
                  {items.map((catEntry) => {
                    const row = bag.clubs.find(
                      (c) => c.catalogId === catEntry.id
                    );
                    if (!row) return null;
                    const isPutter = catEntry.defaultYardsFull <= 0;
                    const isEditingThis = editing?.catalogId === catEntry.id;
                    return (
                      <div key={catEntry.id}>
                        <div
                          className={[
                            "flex items-center gap-1.5 rounded-md border px-1.5 py-1",
                            row.enabled
                              ? "border-emerald-800/50 bg-slate-900/90"
                              : "border-slate-800/80 bg-slate-900/30 opacity-55",
                          ].join(" ")}
                        >
                          <label className="flex min-w-0 flex-1 items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={row.enabled}
                              onChange={(e) =>
                                updateClub(catEntry.id, {
                                  enabled: e.target.checked,
                                })
                              }
                              className="h-3.5 w-3.5 shrink-0 accent-emerald-500"
                            />
                            <span className="truncate text-[11px] font-bold text-white">
                              {catEntry.shortLabel}
                            </span>
                            <span className="hidden truncate text-[9px] text-slate-500 sm:inline">
                              {catEntry.label}
                            </span>
                          </label>
                          {!isPutter ? (
                            <div className="flex shrink-0 gap-0.5">
                              <YardPill
                                label="F"
                                value={row.yardsFull}
                                active={
                                  isEditingThis &&
                                  editing?.field === "yardsFull"
                                }
                                onClick={() =>
                                  setEditing((prev) =>
                                    prev?.catalogId === catEntry.id &&
                                    prev.field === "yardsFull"
                                      ? null
                                      : {
                                          catalogId: catEntry.id,
                                          field: "yardsFull",
                                        }
                                  )
                                }
                              />
                              <YardPill
                                label="¾"
                                value={row.yardsThreeQuarter}
                                active={
                                  isEditingThis &&
                                  editing?.field === "yardsThreeQuarter"
                                }
                                onClick={() =>
                                  setEditing((prev) =>
                                    prev?.catalogId === catEntry.id &&
                                    prev.field === "yardsThreeQuarter"
                                      ? null
                                      : {
                                          catalogId: catEntry.id,
                                          field: "yardsThreeQuarter",
                                        }
                                  )
                                }
                              />
                            </div>
                          ) : null}
                        </div>
                        {isEditingThis && editing ? (
                          <div className="mb-1 mt-0.5 rounded-md border border-amber-500/30 bg-slate-900/80 px-1 py-0.5">
                            <div className="mb-0.5 text-center text-[9px] font-bold text-amber-300/90">
                              {catEntry.shortLabel} ·{" "}
                              {editing.field === "yardsFull" ? "Full" : "3/4"}
                            </div>
                            <YardsRoller
                              size="sm"
                              values={clubYardPickerValues(
                                editing.field === "yardsFull"
                                  ? row.yardsFull
                                  : row.yardsThreeQuarter
                              )}
                              value={
                                editing.field === "yardsFull"
                                  ? row.yardsFull
                                  : row.yardsThreeQuarter
                              }
                              onChange={(v) =>
                                updateClub(catEntry.id, {
                                  [editing.field]: v,
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

        <div className="shrink-0 border-t border-slate-800 px-3 py-2">
          <button
            type="button"
            onClick={() => {
              savePlayerBag(bag);
              onClose();
            }}
            className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-black text-white active:scale-[0.98]"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
        active
          ? "bg-emerald-600 text-white"
          : "bg-slate-800 text-slate-400",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function YardPill({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex min-w-[2.6rem] flex-col items-center rounded px-1 py-0.5",
        active
          ? "bg-amber-500/25 ring-1 ring-amber-400/60"
          : "bg-slate-800/80",
      ].join(" ")}
    >
      <span className="text-[7px] font-bold leading-none text-slate-500">
        {label}
      </span>
      <span className="text-[10px] font-black leading-tight text-white">
        {value}
      </span>
    </button>
  );
}
