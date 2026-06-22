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
  defaultPlannedYardsForShot,
  isWithinLwThreeQuarterReach,
  pickBestClubAndCarry,
  type GreenDistances,
} from "@/lib/distances/suggestClub";
import { puttYardsFromCenter } from "@/lib/distances/holeComplete";
import { LieChip } from "@/components/captura/LieChip";
import type { LieKind } from "@/lib/distances/detectLie";
import { getShotPlanBagClubs, type PlayerBag } from "@/lib/distances/playerBag";
import type { ManualPenaltyReason } from "@/lib/distances/holeShots";
import { MANUAL_PENALTY_OPTIONS } from "@/lib/distances/holeShots";

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
  lieKind?: LieKind;
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
  /** +1 por clic: BI, zanja, perdida y otros (OB y lago = automático). */
  onAddPenalty?: (reason: ManualPenaltyReason) => void;
  /** Vuelve a pedir tocar el mapa para el último golpe ya confirmado. */
  onCorrectLastLanding?: () => void;
}

/** Rollers abajo-izquierda: bastón sugerido por yardas de bolsa vs distancia al green. */
export function ShotPlanPanel({
  bag,
  yardsToGreen,
  greenDist = null,
  lieKind = "rough",
  onGreen = false,
  inBunker = false,
  onConfirm,
  onCancel,
  onAddPenalty,
  onCorrectLastLanding,
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
        inBunker,
        lieKind
      ),
    [enabledClubs, yardsToGreen, greenDist, onGreen, inBunker, lieKind]
  );

  const autoPick = useMemo(
    () => pickToClubPick(picks, autoPlan),
    [picks, autoPlan]
  );

  const clubLabels = useMemo(() => picks.map((p) => p.label), [picks]);

  const [userPick, setUserPick] = useState<{
    clubKey: string;
    plannedYards: number;
  } | null>(null);
  const [clubConfirmed, setClubConfirmed] = useState(false);

  /** Nueva distancia/lie = nuevo golpe; limpiar elección manual previa. */
  useEffect(() => {
    setUserPick(null);
    setClubConfirmed(false);
  }, [yardsToGreen, inBunker, onGreen, lieKind]);

  const userSelectedPick = userPick
    ? picks.find((p) => p.key === userPick.clubKey)
    : null;

  const activePick = userSelectedPick ?? autoPick ?? picks[0];

  const isPutter = activePick?.catalogId === "putter";

  const shortGameReach = isWithinLwThreeQuarterReach(
    yardsToGreen,
    enabledClubs
  );

  const yardValues = useMemo(() => {
    if (isPutter) {
      const hi = Math.max(25, Math.min(60, puttYardsFromCenter(yardsToGreen) + 12));
      return yardRangeValues(1, hi, 1);
    }
    if (shortGameReach) {
      const center = Math.max(MIN_YARD_PICK, Math.round(yardsToGreen));
      return yardRangeValues(
        Math.max(MIN_YARD_PICK, center - 15),
        center + 15,
        1
      );
    }
    return yardRangeValues(MIN_YARD_PICK, MAX_YARD_PICK, 5);
  }, [isPutter, yardsToGreen, shortGameReach]);

  const plannedYards =
    userPick != null && userSelectedPick
      ? userPick.plannedYards
      : defaultPlannedYardsForShot(
          yardsToGreen,
          enabledClubs,
          activePick,
          onGreen
        );

  const handleClubChange = (label: string) => {
    const found = picks.find((p) => p.label === label);
    if (!found) return;
    setUserPick((prev) => ({
      clubKey: found.key,
      plannedYards:
        prev != null
          ? prev.plannedYards
          : defaultPlannedYardsForShot(
              yardsToGreen,
              enabledClubs,
              found,
              onGreen
            ),
    }));
  };

  const handleYardChange = (s: string) => {
    const yards = Number(s);
    if (!Number.isFinite(yards)) return;
    setUserPick((prev) => ({
      clubKey: prev?.clubKey ?? activePick.key,
      plannedYards: yards,
    }));
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
        <div className="flex items-center justify-center gap-1 rounded-md bg-black/80 px-1.5 py-0.5">
          <LieChip kind={lieKind} size="sm" />
          <span className="text-[9px] font-bold text-slate-500">·</span>
          <span className="text-[9px] font-bold text-emerald-300">
            {onGreen || shortGameReach
              ? `${yardsToGreen} al hoyo`
              : `${yardsToGreen} al centro`}
          </span>
        </div>
        {onAddPenalty ? (
          <div className="grid max-w-[9.75rem] grid-cols-3 gap-0.5">
            {MANUAL_PENALTY_OPTIONS.map(({ reason, label }) => (
              <button
                key={reason}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPenalty(reason);
                }}
                className="rounded-md border border-red-500/40 bg-red-950/90 px-0.5 py-0.5 text-[7px] font-black leading-tight text-red-100 active:scale-95"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-0.5 rounded-lg border border-white/20 bg-black/90 p-0.5 shadow-lg backdrop-blur-md">
          <div className="w-[3.25rem]">
            <VerticalRoller
              className="h-[4.5rem] w-full"
              values={clubLabels}
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
          onClick={() => {
            setClubConfirmed(true);
            onConfirm({
              catalogId: activePick.catalogId,
              swing: activePick.swing,
              plannedYards,
            });
          }}
          className={[
            "flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600 text-lg font-black text-white shadow active:scale-95",
            !clubConfirmed ? "yardage-club-confirm-blink ring-2 ring-emerald-300/90" : "",
          ].join(" ")}
          aria-label="Confirmar bastón"
        >
          ✓
        </button>
        <button
          type="button"
          onClick={onCorrectLastLanding ?? onCancel}
          className={[
            "flex h-7 w-9 items-center justify-center rounded-full text-[10px] font-bold active:scale-95",
            onCorrectLastLanding
              ? "border border-amber-500/50 bg-amber-950/90 text-amber-100"
              : "bg-white/10 text-slate-300",
          ].join(" ")}
          aria-label={
            onCorrectLastLanding
              ? "Corregir ubicación de la bola"
              : "Cancelar plan"
          }
          title={
            onCorrectLastLanding
              ? "Corregir ubicación de la bola"
              : "Cancelar plan"
          }
        >
          ✕
        </button>
        {onCorrectLastLanding ? (
          <button
            type="button"
            onClick={onCancel}
            className="text-[8px] font-bold leading-tight text-slate-400 underline active:scale-95"
          >
            cerrar
          </button>
        ) : null}
      </div>
    </div>
  );
}
