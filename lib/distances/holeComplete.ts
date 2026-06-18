/** Distancia al centro (yds) a partir de la cual el hoyo se considera terminado. */
export const HOLE_COMPLETE_MAX_CENTER_YDS = 2;

export function isHoleComplete(centerYards: number): boolean {
  return centerYards <= HOLE_COMPLETE_MAX_CENTER_YDS;
}

/** Yardas al hoyo para putt (precisión 1 yd). */
export function puttYardsFromCenter(centerYards: number): number {
  return Math.max(1, Math.round(centerYards));
}
