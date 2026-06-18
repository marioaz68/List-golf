import type { LieKind } from "@/lib/distances/detectLie";

/** Distancia al centro (yds) para preguntar si el hoyo terminó. */
export const HOLE_COMPLETE_MAX_CENTER_YDS = 1;

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
    pendingShot?.catalogId === "putter" &&
    pendingShot.plannedYards <= 1
  ) {
    return true;
  }
  return false;
}

/** Putt de tap-in: en green, ≤1 yd al hoyo, putter a 1 yd o menos. */
export function isTapInPutt(
  centerYards: number,
  catalogId: string,
  plannedYards: number,
  onGreen: boolean
): boolean {
  return (
    onGreen &&
    catalogId === "putter" &&
    plannedYards <= 1 &&
    centerYards <= HOLE_COMPLETE_MAX_CENTER_YDS
  );
}

/** Yardas al hoyo para putt (precisión 1 yd). */
export function puttYardsFromCenter(centerYards: number): number {
  return Math.max(1, Math.round(centerYards));
}
