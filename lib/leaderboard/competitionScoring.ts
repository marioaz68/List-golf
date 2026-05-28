import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { isStablefordCategory, normalizeCompetitionRule } from "./categoryCompetitionRules";
import {
  effectiveUsesNetLeaderboard,
  type LeaderboardViewOverride,
} from "./leaderboardViewOverride";
import {
  effectivePlayingHandicapForScoring,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "./handicapStrokes";

export { effectivePlayingHandicapForScoring, type StrokeIndexByHole };

export function stablefordPoints(netStrokes: number, par: number): number {
  const diff = netStrokes - par;
  if (diff <= -3) return 5;
  if (diff === -2) return 4;
  if (diff === -1) return 3;
  if (diff === 0) return 2;
  if (diff === 1) return 1;
  return 0;
}

/** Puntos Stableford (neto con PH) y gross/to-par de una ronda. */
export function scoreRoundDetail(
  detail: RoundDetail,
  rule: CategoryCompetitionRule,
  /** PH del torneo (CH × % competencia). Si null, se intenta HI × %. */
  storedPlayingHandicap: number | null | undefined,
  strokeIndexByHole?: StrokeIndexByHole,
  handicapIndexFallback?: number | null | undefined
): {
  gross: number | null;
  toPar: number | null;
  netToPar: number | null;
  netStrokes: number | null;
  stablefordPoints: number | null;
} {
  const catRule = normalizeCompetitionRule(rule);

  if (detail.is_dq) {
    return {
      gross: null,
      toPar: null,
      netToPar: null,
      netStrokes: null,
      stablefordPoints: null,
    };
  }

  const played = detail.holes.filter((h) => h.strokes != null);
  if (played.length === 0 && detail.gross_score == null) {
    return {
      gross: null,
      toPar: null,
      netToPar: null,
      netStrokes: null,
      stablefordPoints: null,
    };
  }

  let gross = detail.gross_score;
  let parPlayed = 0;
  let grossPlayed = 0;
  let points = 0;
  let hasPoints = false;
  let netStrokesPlayed = 0;
  let hasNetLine = false;

  const ph = effectivePlayingHandicapForScoring(
    storedPlayingHandicap,
    handicapIndexFallback,
    catRule.handicap_percentage
  );
  const useNetStableford = isStablefordCategory(catRule);
  const useNetStrokes =
    useNetStableford ||
    (catRule.scoring_format === "stroke_play" &&
      effectiveUsesNetLeaderboard(catRule, null));

  for (const hole of played) {
    const strokes = Number(hole.strokes);
    const par = Number(hole.par ?? 0);
    if (Number.isNaN(strokes)) continue;
    grossPlayed += strokes;
    parPlayed += par;

    if (useNetStrokes) {
      const si = strokeIndexForHole(hole.hole_number, strokeIndexByHole);
      const received = strokesReceivedOnHole(ph, si);
      const netStrokes = strokes - received;
      netStrokesPlayed += netStrokes;
      hasNetLine = true;
      if (useNetStableford) {
        points += stablefordPoints(netStrokes, par);
        hasPoints = true;
      }
    }
  }

  if (gross == null && grossPlayed > 0) gross = grossPlayed;

  const toPar =
    grossPlayed > 0 && parPlayed > 0 ? grossPlayed - parPlayed : detail.to_par;

  const netStrokes =
    hasNetLine
      ? netStrokesPlayed
      : gross != null && useNetStrokes && !useNetStableford && ph > 0
        ? gross - ph
        : null;

  const netToPar =
    hasNetLine && parPlayed > 0
      ? netStrokesPlayed - parPlayed
      : netStrokes != null && parPlayed > 0
        ? netStrokes - parPlayed
        : toPar != null && useNetStrokes && !useNetStableford
          ? toPar - ph
          : null;

  return {
    gross: gross ?? null,
    toPar: toPar ?? null,
    netToPar,
    netStrokes,
    stablefordPoints: useNetStableford && hasPoints ? points : null,
  };
}

/** Acumulado hasta `maxRoundNo` según la base de clasificación de la categoría. */
export function cumulativeLeaderboardValue(
  details: RoundDetail[],
  rule: CategoryCompetitionRule,
  storedPlayingHandicap: number | null | undefined,
  maxRoundNo: number | null,
  strokeIndexByHole?: StrokeIndexByHole,
  leaderboardViewOverride?: LeaderboardViewOverride | null,
  handicapIndexFallback?: number | null | undefined
): {
  sortValue: number | null;
  displayToPar: number | null;
  displayGross: number | null;
  stablefordTotal: number | null;
} {
  const catRule = normalizeCompetitionRule(rule);

  let totalGross = 0;
  let totalToPar = 0;
  let totalNetStrokes = 0;
  let totalNetToPar = 0;
  let totalSf = 0;
  let hasGross = false;
  let hasToPar = false;
  let hasNetStrokes = false;
  let hasNet = false;
  let hasSf = false;

  const byRoundNo = new Map<number, RoundDetail>();
  for (const d of details) {
    if (d.is_dq) continue;
    if (maxRoundNo != null && d.round_no > maxRoundNo) continue;
    if (!byRoundNo.has(d.round_no)) byRoundNo.set(d.round_no, d);
  }

  for (const detail of [...byRoundNo.values()].sort(
    (a, b) => a.round_no - b.round_no
  )) {
    const scored = scoreRoundDetail(
      detail,
      catRule,
      storedPlayingHandicap,
      strokeIndexByHole,
      handicapIndexFallback
    );
    if (scored.gross != null) {
      totalGross += scored.gross;
      hasGross = true;
    }
    if (scored.toPar != null) {
      totalToPar += scored.toPar;
      hasToPar = true;
    }
    if (scored.netStrokes != null) {
      totalNetStrokes += scored.netStrokes;
      hasNetStrokes = true;
    }
    if (scored.netToPar != null) {
      totalNetToPar += scored.netToPar;
      hasNet = true;
    }
    if (scored.stablefordPoints != null) {
      totalSf += scored.stablefordPoints;
      hasSf = true;
    }
  }

  if (isStablefordCategory(catRule)) {
    return {
      sortValue: hasSf ? totalSf : null,
      displayToPar: hasSf ? totalSf : null,
      displayGross: hasGross ? totalGross : null,
      stablefordTotal: hasSf ? totalSf : null,
    };
  }

  if (effectiveUsesNetLeaderboard(catRule, leaderboardViewOverride)) {
    return {
      sortValue: hasNet
        ? totalNetToPar
        : hasToPar
          ? totalToPar
          : hasNetStrokes
            ? totalNetStrokes
            : null,
      displayToPar: hasNet ? totalNetToPar : hasToPar ? totalToPar : null,
      displayGross: hasGross ? totalGross : null,
      stablefordTotal: null,
    };
  }

  // Gross: clasificar por to-par acumulado (± vs par), no por golpes brutos totales.
  if (hasToPar) {
    return {
      sortValue: totalToPar,
      displayToPar: totalToPar,
      displayGross: hasGross ? totalGross : null,
      stablefordTotal: null,
    };
  }

  if (hasGross) {
    return {
      sortValue: null,
      displayToPar: null,
      displayGross: totalGross,
      stablefordTotal: null,
    };
  }

  return {
    sortValue: null,
    displayToPar: null,
    displayGross: null,
    stablefordTotal: null,
  };
}
