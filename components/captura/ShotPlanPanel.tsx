"use client";

import { useEffect, useMemo, useState } from "react";
import { VerticalRoller } from "@/components/captura/VerticalRoller";
import {
  carryYards,
  clubYardPickerValues,
  CLUB_BY_ID,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import { getEnabledBagClubs, type PlayerBag } from "@/lib/distances/playerBag";

export interface ClubPick {
  key: string;
  catalogId: string;
  swing: SwingKind;
  label: string;
}

function buildClubPicks(bag: PlayerBag): ClubPick[] {
  const out: ClubPick[] = [];
  for (const c of getEnabledBagClubs(bag)) {
    const cat = CLUB_BY_ID[c.catalogId];
    if (!cat) continue;
    out.push({
      key: `${c.catalogId}:full`,
      catalogId: c.catalogId,
      swing: "full",
      label: `${cat.shortLabel} · full`,
    });
    out.push({
      key: `${c.catalogId}:three_quarter`,
      catalogId: c.catalogId,
      swing: "three_quarter",
      label: `${cat.shortLabel} · 3/4`,
    });
  }
  return out;
}

interface ShotPlanPanelProps {
  bag: PlayerBag;
  onConfirm: (plan: {
    catalogId: string;
    swing: SwingKind;
    plannedYards: number;
  }) => void;
  onCancel: () => void;
}

export function ShotPlanPanel({ bag, onConfirm, onCancel }: ShotPlanPanelProps) {
  const picks = useMemo(() => buildClubPicks(bag), [bag]);
  const [clubKey, setClubKey] = useState(picks[0]?.key ?? "");
  const pick = picks.find((p) => p.key === clubKey) ?? picks[0];

  const bagClub = bag.clubs.find((c) => c.catalogId === pick?.catalogId);
  const defaultYards = pick && bagClub
    ? carryYards(bagClub.yardsFull, bagClub.yardsThreeQuarter, pick.swing)
    : 100;

  const yardValues = useMemo(
    () => clubYardPickerValues(defaultYards),
    [defaultYards]
  );
  const [plannedYards, setPlannedYards] = useState(defaultYards);

  useEffect(() => {
    if (!pick) return;
    const bc = bag.clubs.find((c) => c.catalogId === pick.catalogId);
    if (!bc) return;
    const y = carryYards(bc.yardsFull, bc.yardsThreeQuarter, pick.swing);
    setPlannedYards(y);
  }, [pick, bag.clubs]);

  const yardLabels = useMemo(
    () => yardValues.map((y) => String(y)),
    [yardValues]
  );
  const plannedStr = String(plannedYards);

  if (!pick || !picks.length) {
    return (
      <div className="pointer-events-auto mx-2 rounded-lg border border-amber-500/40 bg-black/85 px-3 py-2 text-center text-[11px] text-amber-200">
        Activa bastones en Bolsa primero.
        <button
          type="button"
          onClick={onCancel}
          className="ml-2 font-bold text-white underline"
        >
          Cerrar
        </button>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto mx-2 rounded-lg border border-white/15 bg-black/88 px-2 py-2 shadow-lg backdrop-blur-md">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Planear golpe
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="text-[10px] font-bold text-slate-500"
        >
          ✕
        </button>
      </div>
      <div className="flex items-stretch gap-2">
        <div className="flex flex-1 flex-col items-center rounded-md border border-slate-700/80 bg-slate-950/80 py-1">
          <span className="mb-0.5 text-[8px] font-bold uppercase text-slate-500">
            Bastón
          </span>
          <VerticalRoller
            className="h-[4.5rem] w-full"
            values={picks.map((p) => p.label)}
            value={pick.label}
            onChange={(label) => {
              const found = picks.find((p) => p.label === label);
              if (found) setClubKey(found.key);
            }}
          />
        </div>
        <div className="flex flex-1 flex-col items-center rounded-md border border-slate-700/80 bg-slate-950/80 py-1">
          <span className="mb-0.5 text-[8px] font-bold uppercase text-slate-500">
            Yardas
          </span>
          <VerticalRoller
            className="h-[4.5rem] w-full"
            values={yardLabels}
            value={plannedStr}
            onChange={(s) => setPlannedYards(Number(s))}
          />
        </div>
      </div>
      <button
        type="button"
        onClick={() =>
          onConfirm({
            catalogId: pick.catalogId,
            swing: pick.swing,
            plannedYards,
          })
        }
        className="mt-2 w-full rounded-lg bg-emerald-600 py-2 text-xs font-black text-white active:scale-[0.98]"
      >
        Guardar plan · toca donde quede la bola
      </button>
    </div>
  );
}
