/** Índice de handicap del hoyo (1 = más difícil) para repartir golpes de juego. */
export type StrokeIndexByHole = Map<number, number>;

export function playingHandicap(
  handicapIndex: number | null | undefined,
  percentage: number
): number {
  const hcp = Number(handicapIndex);
  if (!Number.isFinite(hcp) || hcp <= 0) return 0;
  const pct = Number(percentage);
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  return Math.round((hcp * pct) / 100);
}

/**
 * PH para netos: si ya hay PH del torneo (CH×% competencia vía WHS), úsalo tal cual.
 * Si no, fallback legacy HI×% (incompleto; falta slope/rating del campo).
 */
export function effectivePlayingHandicapForScoring(
  storedPlayingHandicap: number | null | undefined,
  handicapIndexFallback: number | null | undefined,
  competitionPercentage: number
): number {
  if (
    storedPlayingHandicap != null &&
    Number.isFinite(Number(storedPlayingHandicap))
  ) {
    return Math.round(Number(storedPlayingHandicap));
  }
  return playingHandicap(handicapIndexFallback, competitionPercentage);
}

/** Golpes recibidos en un hoyo según PH y stroke index (WHS simplificado). */
export function strokesReceivedOnHole(
  playingHcp: number,
  strokeIndex: number
): number {
  if (playingHcp <= 0) return 0;
  const si = Math.max(1, Math.min(18, Math.trunc(strokeIndex)));
  const base = Math.floor(playingHcp / 18);
  const extra = playingHcp % 18;
  return base + (si <= extra ? 1 : 0);
}

export function strokeIndexForHole(
  holeNumber: number,
  strokeIndexByHole?: StrokeIndexByHole
): number {
  const fromCourse = strokeIndexByHole?.get(holeNumber);
  if (fromCourse != null && Number.isFinite(fromCourse)) {
    return Math.max(1, Math.min(18, Math.trunc(fromCourse)));
  }
  return Math.max(1, Math.min(18, holeNumber));
}
