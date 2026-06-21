import type { LieKind } from "@/lib/distances/detectLie";

/** Distancia al centro (yds) para preguntar si el hoyo terminó. */
export const HOLE_COMPLETE_MAX_CENTER_YDS = 1;
/** Putt/chip corto en green: hasta 2 yds al hoyo. */
export const SHORT_PUTT_MAX_CENTER_YDS = 2;
export const SHORT_PUTT_MAX_PLANNED_YDS = 2;

export function isHoleComplete(centerYards: number): boolean {
  return centerYards <= HOLE_COMPLETE_MAX_CENTER_YDS;
}

/** ¿Mostrar diálogo entró / dada / sigo jugando? */
export function shouldPromptHoleFinish(
  centerYards: number,
  pendingShot?: {
    catalogId: string;
    plannedYards: number;
  } | null,
  lieKind?: LieKind
): boolean {
  if (isHoleComplete(centerYards)) return true;
  if (
    lieKind === "green" &&
    pendingShot &&
    pendingShot.plannedYards <= SHORT_PUTT_MAX_PLANNED_YDS &&
    centerYards <= SHORT_PUTT_MAX_CENTER_YDS
  ) {
    return true;
  }
  return false;
}

/**
 * Putt/chip corto en green: al confirmar basto, pregunta entró/dada sin marcar
 * caída (tap-in ≤1 yd o putt de hasta 2 yds estando a ≤2 yds del hoyo).
 */
export function isTapInPutt(
  centerYards: number,
  catalogId: string,
  plannedYards: number,
  onGreen: boolean
): boolean {
  if (!onGreen) return false;
  if (
    plannedYards <= HOLE_COMPLETE_MAX_CENTER_YDS &&
    centerYards <= HOLE_COMPLETE_MAX_CENTER_YDS
  ) {
    return true;
  }
  return (
    plannedYards <= SHORT_PUTT_MAX_PLANNED_YDS &&
    centerYards <= SHORT_PUTT_MAX_CENTER_YDS
  );
}

/** Yardas al hoyo para putt (precisión 1 yd). */
export function puttYardsFromCenter(centerYards: number): number {
  return Math.max(1, Math.round(centerYards));
}
