"use client";

import { useEffect, useMemo, useState } from "react";
import {
  carryYards,
  CLUB_BY_ID,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import {
  defaultPlannedYardsForShot,
  isShortGameDistance,
  pickBestClubAndCarry,
  shotPlanYardRollerValues,
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

/** Stepper vertical grande con flechas ▲▼ (fácil de usar con el dedo). */
function ArrowStepper({
  caption,
  value,
  sub,
  onUp,
  onDown,
  upDisabled,
  downDisabled,
  valueClassName = "text-3xl",
  subClassName = "mt-1 text-base font-black text-amber-300",
}: {
  caption: string;
  value: string;
  sub?: string | null;
  onUp: () => void;
  onDown: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  valueClassName?: string;
  subClassName?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUp();
        }}
        disabled={upDisabled}
        className="flex h-11 w-14 items-center justify-center rounded-lg bg-white/15 text-2xl font-black text-white active:scale-90 disabled:opacity-30"
        aria-label={`Subir ${caption}`}
      >
        ▲
      </button>
      <div className="flex min-w-[4.5rem] flex-col items-center rounded-lg bg-black/60 px-2 py-1">
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {caption}
        </span>
        <span className={`font-black leading-none text-white ${valueClassName}`}>
          {value}
        </span>
        {sub ? (
          <span className={subClassName}>
            {sub}
          </span>
        ) : null}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDown();
        }}
        disabled={downDisabled}
        className="flex h-11 w-14 items-center justify-center rounded-lg bg-white/15 text-2xl font-black text-white active:scale-90 disabled:opacity-30"
        aria-label={`Bajar ${caption}`}
      >
        ▼
      </button>
    </div>
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
  /** Vista previa en mapa al mover bastón o yardas. */
  onPreviewChange?: (preview: {
    catalogId: string;
    swing: SwingKind;
    plannedYards: number;
  }) => void;
  /** +1 por clic: BI, zanja, perdida y otros (OB y lago = automático). */
  onAddPenalty?: (reason: ManualPenaltyReason) => void;
  /** Vuelve a pedir tocar el mapa para el último golpe ya confirmado. */
  onCorrectLastLanding?: () => void;
}

/** Panel abajo-izquierda: bastón sugerido por yardas de bolsa vs distancia al green. */
export function ShotPlanPanel({
  bag,
  yardsToGreen,
  greenDist = null,
  lieKind = "rough",
  onGreen = false,
  inBunker = false,
  onConfirm,
  onCancel,
  onPreviewChange,
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

  const shortGame = isShortGameDistance(yardsToGreen) && !isPutter;

  const plannedYards =
    userPick != null && userSelectedPick
      ? userPick.plannedYards
      : defaultPlannedYardsForShot(
          yardsToGreen,
          enabledClubs,
          activePick,
          onGreen
        );

  const yardValues = useMemo(
    () =>
      shotPlanYardRollerValues({
        yardsToGreen,
        plannedYards,
        isPutter,
        shortGame,
      }),
    [yardsToGreen, plannedYards, isPutter, shortGame]
  );

  useEffect(() => {
    if (!activePick || plannedYards <= 0) return;
    onPreviewChange?.({
      catalogId: activePick.catalogId,
      swing: activePick.swing,
      plannedYards,
    });
  }, [activePick, plannedYards, onPreviewChange]);

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

  // Índice del bastón activo para navegar con las flechas.
  const clubIdx = Math.max(
    0,
    picks.findIndex((p) => p.key === activePick.key)
  );

  const stepClub = (dir: -1 | 1) => {
    const next = picks[clubIdx + dir];
    if (next) handleClubChange(next.label);
  };

  // Índice de la yarda actual dentro de la lista de valores permitidos.
  const yardIdx = (() => {
    if (!yardValues.length) return -1;
    let best = 0;
    let bestDiff = Infinity;
    for (let i = 0; i < yardValues.length; i++) {
      const d = Math.abs(yardValues[i] - plannedYards);
      if (d < bestDiff) {
        bestDiff = d;
        best = i;
      }
    }
    return best;
  })();

  // Yardas: ▲ = más lejos (valor mayor), ▼ = más cerca (valor menor).
  const stepYard = (dir: -1 | 1) => {
    if (yardIdx < 0) return;
    const next = yardValues[yardIdx + dir];
    if (next != null) handleYardChange(String(next));
  };

  return (
    <div className="pointer-events-auto fixed bottom-[7.5rem] left-2 z-[1060] flex items-stretch gap-2">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-center gap-1.5 rounded-md bg-black/80 px-2 py-1">
          <LieChip kind={lieKind} size="sm" />
          <span className="text-[10px] font-bold text-slate-500">·</span>
          <span className="text-[11px] font-bold text-emerald-300">
            {onGreen ? `${yardsToGreen} al hoyo` : `${yardsToGreen} al centro`}
          </span>
        </div>
        {onAddPenalty ? (
          <div className="grid max-w-[12rem] grid-cols-3 gap-1">
            {MANUAL_PENALTY_OPTIONS.map(({ reason, label }) => (
              <button
                key={reason}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddPenalty(reason);
                }}
                className="rounded-md border border-red-500/40 bg-red-950/90 px-1 py-1 text-[9px] font-black leading-tight text-red-100 active:scale-95"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex gap-3 rounded-2xl border border-white/20 bg-black/90 p-3 shadow-lg backdrop-blur-md">
          <ArrowStepper
            caption="Bastón"
            value={activePick.short}
            sub={swingLabel}
            valueClassName="text-2xl"
            subClassName="mt-1 text-2xl font-black text-amber-300"
            onUp={() => stepClub(-1)}
            onDown={() => stepClub(1)}
            upDisabled={clubIdx <= 0}
            downDisabled={clubIdx >= picks.length - 1}
          />
          <ArrowStepper
            caption="Yardas"
            value={String(plannedYards)}
            sub={
              activePick.carryYards > 0 && !isPutter
                ? `${activePick.carryYards} yd bolsa`
                : null
            }
            valueClassName="text-3xl"
            subClassName="mt-1 text-xs font-bold text-slate-300"
            onUp={() => stepYard(1)}
            onDown={() => stepYard(-1)}
            upDisabled={yardIdx < 0 || yardIdx >= yardValues.length - 1}
            downDisabled={yardIdx <= 0}
          />
        </div>
      </div>
      <div className="flex flex-col justify-center gap-2">
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
            "flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-3xl font-black text-white shadow active:scale-95",
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
            "flex h-11 w-14 items-center justify-center rounded-full text-lg font-bold active:scale-95",
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
            className="text-[10px] font-bold leading-tight text-slate-400 underline active:scale-95"
          >
            cerrar
          </button>
        ) : null}
      </div>
    </div>
  );
}
