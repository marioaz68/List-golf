"use client";

import { useEffect, useMemo, useState } from "react";
import { VerticalRoller } from "@/components/captura/VerticalRoller";
import {
  carryYards,
  CLUB_BY_ID,
  MAX_YARD_PICK,
  MIN_YARD_PICK,
  yardRangeValues,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import {
  pickBestClubAndCarry,
  type GreenDistances,
} from "@/lib/distances/suggestClub";
import { puttYardsFromCenter } from "@/lib/distances/holeComplete";
import { getShotPlanBagClubs, type PlayerBag } from "@/lib/distances/playerBag";

type ClubPick = {
  key: string;
  catalogId: string;
  swing: SwingKind;
  label: string;
  short: string;
  carryYards: number;
};

function buildClubPicks(bag: PlayerBag): ClubPick[] {
  const out: ClubPick[] = [];
  for (const c of getShotPlanBagClubs(bag)) {
    const cat = CLUB_BY_ID[c.catalogId];
    if (!cat) continue;
    if (cat.category === "putter") {
      out.push({
        key: "putter:full",
        catalogId: "putter",
        swing: "full",
        label: "Putt",
        short: "P",
        carryYards: 0,
      });
      continue;
    }
    const fullCarry = carryYards(c.yardsFull, c.yardsThreeQuarter, "full");
    const threeQuarterCarry = carryYards(
      c.yardsFull,
      c.yardsThreeQuarter,
      "three_quarter"
    );
    out.push({
      key: `${c.catalogId}:full`,
      catalogId: c.catalogId,
      swing: "full",
      label: `${cat.shortLabel} full`,
      short: cat.shortLabel,
      carryYards: fullCarry,
    });
    out.push({
      key: `${c.catalogId}:three_quarter`,
      catalogId: c.catalogId,
      swing: "three_quarter",
      label: `${cat.shortLabel} 3/4`,
      short: cat.shortLabel,
      carryYards: threeQuarterCarry,
    });
  }
  return out;
}

function carryForPick(
  pick: ClubPick | undefined,
  yardsToGreen: number
): number {
  if (!pick) return MIN_YARD_PICK;
  if (pick.catalogId === "putter") {
    return puttYardsFromCenter(yardsToGreen);
  }
  if (pick.carryYards > 0) return pick.carryYards;
  return MIN_YARD_PICK;
}

function pickToClubPick(
  picks: ClubPick[],
  plan: ReturnType<typeof pickBestClubAndCarry>
): ClubPick | null {
  if (!plan) return null;
  return (
    picks.find(
      (p) => p.catalogId === plan.catalogId && p.swing === plan.swing
    ) ??
    picks.find((p) => p.label === plan.rollerLabel) ??
    null
  );
}

interface ShotPlanPanelProps {
  bag: PlayerBag;
  /** Yardas al centro del green desde la bola / salida actual. */
  yardsToGreen: number;
  greenDist?: GreenDistances | null;
  /** Bola dentro del área del green calibrada (o estimada). */
  onGreen?: boolean;
  /** Bola en trampa calibrada (polígono o punto guardado). */
  inBunker?: boolean;
  onConfirm: (plan: {
    catalogId: string;
    swing: SwingKind;
    plannedYards: number;
  }) => void;
  onCancel: () => void;
}

/** Rollers abajo-izquierda: bastón sugerido por yardas de bolsa vs distancia al green. */
export function ShotPlanPanel({
  bag,
  yardsToGreen,
  greenDist = null,
  onGreen = false,
  inBunker = false,
  onConfirm,
  onCancel,
}: ShotPlanPanelProps) {
  const picks = useMemo(() => buildClubPicks(bag), [bag]);

  const enabledClubs = useMemo(() => getShotPlanBagClubs(bag), [bag]);

  const autoPlan = useMemo(
    () =>
      pickBestClubAndCarry(
        enabledClubs,
        yardsToGreen,
        greenDist,
        onGreen,
        inBunker
      ),
    [enabledClubs, yardsToGreen, greenDist, onGreen, inBunker]
  );

  const autoPick = useMemo(
    () => pickToClubPick(picks, autoPlan),
    [picks, autoPlan]
  );

  const [userPick, setUserPick] = useState<{
    clubKey: string;
    plannedYards: number;
  } | null>(null);

  /** Nueva distancia al green = nuevo golpe; limpiar elección manual previa. */
  useEffect(() => {
    setUserPick(null);
  }, [yardsToGreen]);

  const userSelectedPick = userPick
    ? picks.find((p) => p.key === userPick.clubKey)
    : null;

  const activePick = userSelectedPick ?? autoPick ?? picks[0];

  const isPutter = activePick?.catalogId === "putter";

  const yardValues = useMemo(() => {
    if (isPutter) {
      const hi = Math.max(25, Math.min(60, puttYardsFromCenter(yardsToGreen) + 12));
      return yardRangeValues(1, hi, 1);
    }
    return yardRangeValues(MIN_YARD_PICK, MAX_YARD_PICK, 5);
  }, [isPutter, yardsToGreen]);

  const plannedYards =
    userPick != null && userSelectedPick
      ? userPick.plannedYards
      : carryForPick(activePick, yardsToGreen);

  const handleClubChange = (label: string) => {
    const found = picks.find((p) => p.label === label);
    if (!found) return;
    setUserPick({
      clubKey: found.key,
      plannedYards: carryForPick(found, yardsToGreen),
    });
  };

  const handleYardChange = (s: string) => {
    const yards = Number(s);
    setUserPick({
      clubKey: activePick.key,
      plannedYards: yards,
    });
  };

  const yardLabels = useMemo(
    () => yardValues.map((y) => String(y)),
    [yardValues]
  );

  if (!picks.length || yardsToGreen <= 0) {
    return (
      <div className="pointer-events-auto fixed bottom-[9.5rem] left-2 z-[1060] rounded-lg border border-amber-500/40 bg-black/90 px-2 py-1.5 text-[10px] text-amber-200">
        {yardsToGreen <= 0
          ? "Esperando distancia al green…"
          : "Activa bastones en Bolsa."}
        <button type="button" onClick={onCancel} className="ml-1 font-bold underline">
          ✕
        </button>
      </div>
    );
  }

  if (!activePick) {
    return null;
  }

  const swingLabel = isPutter
    ? "putt"
    : activePick.swing === "three_quarter"
      ? "3/4"
      : "full";

  return (
    <div className="pointer-events-auto fixed bottom-[9.5rem] left-2 z-[1060] flex items-stretch gap-1">
      <div className="flex flex-col gap-0.5">
        <div className="rounded-md bg-black/80 px-1.5 py-0.5 text-center text-[9px] font-bold text-emerald-300">
          {onGreen ? (
            <>
              <span className="text-amber-200">En el green</span>
              <span className="text-slate-400"> · </span>
              {yardsToGreen} al hoyo
            </>
          ) : inBunker ? (
            <>
              <span className="text-amber-200">En trampa</span>
              <span className="text-slate-400"> · </span>
              {yardsToGreen} al centro
            </>
          ) : (
            <>{yardsToGreen} al centro</>
          )}
        </div>
        <div className="flex gap-0.5 rounded-lg border border-white/20 bg-black/90 p-0.5 shadow-lg backdrop-blur-md">
          <div className="w-[3.25rem]">
            <VerticalRoller
              className="h-[4.5rem] w-full"
              values={picks.map((p) => p.label)}
              value={activePick.label}
              onChange={handleClubChange}
            />
          </div>
          <div className="w-[2.75rem]">
            <VerticalRoller
              className="h-[4.5rem] w-full"
              values={yardLabels}
              value={String(plannedYards)}
              onChange={handleYardChange}
            />
          </div>
        </div>
      </div>
      <div className="flex min-w-[3.5rem] flex-col items-center justify-center rounded-lg border border-amber-500/30 bg-black/90 px-1.5 py-0.5 shadow-lg">
        <span className="text-sm font-black leading-none text-white">
          {activePick.short}
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
              catalogId: activePick.catalogId,
              swing: activePick.swing,
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
