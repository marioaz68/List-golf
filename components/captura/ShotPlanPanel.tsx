"use client";

import { useMemo, useState } from "react";
import { VerticalRoller } from "@/components/captura/VerticalRoller";
import {
  carryYards,
  CLUB_BY_ID,
  MAX_YARD_PICK,
  MIN_YARD_PICK,
  shouldSuggestPutter,
  yardRangeValues,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import type { GreenDistances } from "@/lib/distances/suggestClub";
import { getEnabledBagClubs, type PlayerBag } from "@/lib/distances/playerBag";

type ClubPick = {
  key: string;
  catalogId: string;
  swing: SwingKind;
  label: string;
  short: string;
};

function buildClubPicks(bag: PlayerBag): ClubPick[] {
  const out: ClubPick[] = [];
  for (const c of getEnabledBagClubs(bag)) {
    const cat = CLUB_BY_ID[c.catalogId];
    if (!cat) continue;
    if (cat.category === "putter") {
      out.push({
        key: "putter:full",
        catalogId: "putter",
        swing: "full",
        label: "Putter",
        short: "P",
      });
      continue;
    }
    out.push({
      key: `${c.catalogId}:full`,
      catalogId: c.catalogId,
      swing: "full",
      label: `${cat.shortLabel} full`,
      short: cat.shortLabel,
    });
    out.push({
      key: `${c.catalogId}:three_quarter`,
      catalogId: c.catalogId,
      swing: "three_quarter",
      label: `${cat.shortLabel} 3/4`,
      short: cat.shortLabel,
    });
  }
  return out;
}

function scoreCarry(carry: number, targetYards: number): number {
  const gap = carry - targetYards;
  const shortfall = gap < 0 ? -gap : 0;
  return Math.abs(gap) + shortfall * 1.5;
}

function carryForPick(
  pick: ClubPick | undefined,
  bag: PlayerBag,
  suggestedYards?: number
): number {
  if (!pick) return MIN_YARD_PICK;
  if (pick.catalogId === "putter") {
    return Math.max(
      MIN_YARD_PICK,
      Math.round((suggestedYards ?? 10) / 5) * 5
    );
  }
  const bc = bag.clubs.find((c) => c.catalogId === pick.catalogId);
  if (!bc) return MIN_YARD_PICK;
  return carryYards(bc.yardsFull, bc.yardsThreeQuarter, pick.swing);
}

function bestPickForDistance(
  picks: ClubPick[],
  bag: PlayerBag,
  targetYards: number,
  greenDist: GreenDistances | null
): ClubPick | null {
  if (!picks.length || targetYards <= 0) return picks[0] ?? null;
  if (shouldSuggestPutter(targetYards, greenDist)) {
    return picks.find((p) => p.catalogId === "putter") ?? picks[0] ?? null;
  }
  let best: ClubPick | null = null;
  let bestScore = Infinity;
  for (const p of picks) {
    const bc = bag.clubs.find((c) => c.catalogId === p.catalogId);
    if (!bc) continue;
    const carry = carryYards(bc.yardsFull, bc.yardsThreeQuarter, p.swing);
    if (carry <= 0) continue;
    const score = scoreCarry(carry, targetYards);
    if (
      score < bestScore ||
      (score === bestScore &&
        best &&
        p.swing === "full" &&
        best.swing === "three_quarter")
    ) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? picks[0] ?? null;
}

function initialPlanState(
  picks: ClubPick[],
  bag: PlayerBag,
  suggestedYards: number,
  greenDist: GreenDistances | null
): { clubKey: string; plannedYards: number } {
  const fallback = picks[0];
  if (!suggestedYards || suggestedYards <= 0 || !picks.length) {
    return {
      clubKey: fallback?.key ?? "",
      plannedYards: carryForPick(fallback, bag, suggestedYards),
    };
  }
  const best = bestPickForDistance(picks, bag, suggestedYards, greenDist);
  if (!best) {
    return {
      clubKey: fallback?.key ?? "",
      plannedYards: carryForPick(fallback, bag, suggestedYards),
    };
  }
  return {
    clubKey: best.key,
    plannedYards: carryForPick(best, bag, suggestedYards),
  };
}

interface ShotPlanPanelProps {
  bag: PlayerBag;
  /** Yardas al centro del green desde la bola / salida actual. */
  suggestedYards: number;
  greenDist?: GreenDistances | null;
  onConfirm: (plan: {
    catalogId: string;
    swing: SwingKind;
    plannedYards: number;
  }) => void;
  onCancel: () => void;
}

/** Rollers abajo-izquierda, compactos; bastón y yardas visibles al centro. */
export function ShotPlanPanel({
  bag,
  suggestedYards,
  greenDist = null,
  onConfirm,
  onCancel,
}: ShotPlanPanelProps) {
  const picks = useMemo(() => buildClubPicks(bag), [bag]);
  const yardValues = useMemo(
    () => yardRangeValues(MIN_YARD_PICK, MAX_YARD_PICK, 5),
    []
  );

  const initial = useMemo(
    () => initialPlanState(picks, bag, suggestedYards, greenDist),
    [picks, bag, suggestedYards, greenDist]
  );

  const [clubKey, setClubKey] = useState(initial.clubKey);
  const [plannedYards, setPlannedYards] = useState(initial.plannedYards);

  const pick = picks.find((p) => p.key === clubKey) ?? picks[0];
  const isPutter = pick?.catalogId === "putter";

  const handleClubChange = (label: string) => {
    const found = picks.find((p) => p.label === label);
    if (!found) return;
    setClubKey(found.key);
    setPlannedYards(carryForPick(found, bag, suggestedYards));
  };

  const yardLabels = useMemo(
    () => yardValues.map((y) => String(y)),
    [yardValues]
  );

  if (!pick || !picks.length) {
    return (
      <div className="pointer-events-auto fixed bottom-[9.5rem] left-2 z-[1060] rounded-lg border border-amber-500/40 bg-black/90 px-2 py-1.5 text-[10px] text-amber-200">
        Activa bastones en Bolsa.
        <button type="button" onClick={onCancel} className="ml-1 font-bold underline">
          ✕
        </button>
      </div>
    );
  }

  const swingLabel = isPutter
    ? "putt"
    : pick.swing === "three_quarter"
      ? "3/4"
      : "full";

  return (
    <div className="pointer-events-auto fixed bottom-[9.5rem] left-2 z-[1060] flex items-stretch gap-1">
      <div className="flex flex-col gap-0.5">
        <div className="rounded-md bg-black/80 px-1.5 py-0.5 text-center text-[9px] font-bold text-emerald-300">
          {suggestedYards} al centro
        </div>
        <div className="flex gap-0.5 rounded-lg border border-white/20 bg-black/90 p-0.5 shadow-lg backdrop-blur-md">
          <div className="w-[3.25rem]">
            <VerticalRoller
              className="h-[4.5rem] w-full"
              values={picks.map((p) => p.label)}
              value={pick.label}
              onChange={handleClubChange}
            />
          </div>
          <div className="w-[2.75rem]">
            <VerticalRoller
              className="h-[4.5rem] w-full"
              values={yardLabels}
              value={String(plannedYards)}
              onChange={(s) => setPlannedYards(Number(s))}
            />
          </div>
        </div>
      </div>
      <div className="flex min-w-[3.5rem] flex-col items-center justify-center rounded-lg border border-amber-500/30 bg-black/90 px-1.5 py-0.5 shadow-lg">
        <span className="text-sm font-black leading-none text-white">
          {pick.short}
        </span>
        <span className="text-[9px] font-bold text-amber-300">{swingLabel}</span>
        <span className="mt-0.5 text-base font-black leading-none text-emerald-300">
          {plannedYards}
        </span>
      </div>
      <div className="flex flex-col justify-center gap-1">
        <button
          type="button"
          onClick={() =>
            onConfirm({
              catalogId: pick.catalogId,
              swing: pick.swing,
              plannedYards,
            })
          }
          className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-lg font-black text-white shadow active:scale-95"
          aria-label="Guardar plan"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex h-7 w-9 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-300"
          aria-label="Cancelar"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
