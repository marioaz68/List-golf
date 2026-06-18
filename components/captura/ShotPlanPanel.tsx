"use client";

import { useEffect, useMemo, useState } from "react";
import { VerticalRoller } from "@/components/captura/VerticalRoller";
import {
  carryYards,
  clubYardPickerValues,
  CLUB_BY_ID,
  shouldSuggestPutter,
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

/** Bastón + swing que mejor encajan con la distancia al green. */
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
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best ?? picks[0] ?? null;
}

interface ShotPlanPanelProps {
  bag: PlayerBag;
  /** Yardas sugeridas al abrir (p. ej. distancia al green desde la salida). */
  suggestedYards?: number;
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
  const [clubKey, setClubKey] = useState(picks[0]?.key ?? "");
  const pick = picks.find((p) => p.key === clubKey) ?? picks[0];

  const bagClub = bag.clubs.find((c) => c.catalogId === pick?.catalogId);
  const isPutter = pick?.catalogId === "putter";
  const defaultYards = isPutter
    ? Math.max(5, Math.round((suggestedYards ?? 10) / 5) * 5)
    : pick && bagClub
      ? carryYards(bagClub.yardsFull, bagClub.yardsThreeQuarter, pick.swing)
      : 100;

  const yardValues = useMemo(
    () => clubYardPickerValues(defaultYards, suggestedYards),
    [defaultYards, suggestedYards]
  );
  const [plannedYards, setPlannedYards] = useState(defaultYards);

  useEffect(() => {
    if (!suggestedYards || suggestedYards <= 0 || !picks.length) return;
    const best = bestPickForDistance(picks, bag, suggestedYards, greenDist);
    if (best) setClubKey(best.key);
  }, [suggestedYards, greenDist, bag, picks]);

  useEffect(() => {
    if (!pick) return;
    if (pick.catalogId === "putter") {
      if (suggestedYards != null && suggestedYards > 0) {
        setPlannedYards(Math.max(5, Math.round(suggestedYards / 5) * 5));
      }
      return;
    }
    const bc = bag.clubs.find((c) => c.catalogId === pick.catalogId);
    if (!bc) return;
    setPlannedYards(
      carryYards(bc.yardsFull, bc.yardsThreeQuarter, pick.swing)
    );
  }, [pick, bag.clubs, suggestedYards]);

  const yardLabels = useMemo(
    () => yardValues.map((y) => String(y)),
    [yardValues]
  );

  useEffect(() => {
    if (suggestedYards == null || suggestedYards <= 0 || !yardValues.length) return;
    const nearest = yardValues.reduce((best, y) =>
      Math.abs(y - suggestedYards) < Math.abs(best - suggestedYards) ? y : best
    );
    setPlannedYards(nearest);
  }, [suggestedYards, yardValues]);

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
      <div className="flex gap-0.5 rounded-lg border border-white/20 bg-black/90 p-0.5 shadow-lg backdrop-blur-md">
        <div className="w-[3.25rem]">
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
        <div className="w-[2.75rem]">
          <VerticalRoller
            className="h-[4.5rem] w-full"
            values={yardLabels}
            value={String(plannedYards)}
            onChange={(s) => setPlannedYards(Number(s))}
          />
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
