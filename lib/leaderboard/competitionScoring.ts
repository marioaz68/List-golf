import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { isStablefordCategory, normalizeCompetitionRule } from "./categoryCompetitionRules";
import {
  playingHandicap,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "./handicapStrokes";

export { playingHandicap, type StrokeIndexByHole };

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
  handicapIndex: number | null | undefined,
  strokeIndexByHole?: StrokeIndexByHole
): {
  gross: number | null;
  toPar: number | null;
  netToPar: number | null;
  stablefordPoints: number | null;
} {
  const catRule = normalizeCompetitionRule(rule);

  if (detail.is_dq) {
    return {
      gross: null,
      toPar: null,
      netToPar: null,
      stablefordPoints: null,
    };
  }

  const played = detail.holes.filter((h) => h.strokes != null);
  if (played.length === 0 && detail.gross_score == null) {
    return {
      gross: null,
      toPar: null,
      netToPar: null,
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

  const ph = playingHandicap(handicapIndex, catRule.handicap_percentage);
  const useNetStableford = isStablefordCategory(catRule);

  for (const hole of played) {
    const strokes = Number(hole.strokes);
    const par = Number(hole.par ?? 0);
    if (Number.isNaN(strokes)) continue;
    grossPlayed += strokes;
    parPlayed += par;

    if (useNetStableford) {
      const si = strokeIndexForHole(hole.hole_number, strokeIndexByHole);
      const received = strokesReceivedOnHole(ph, si);
      const netStrokes = strokes - received;
      netStrokesPlayed += netStrokes;
      hasNetLine = true;
      points += stablefordPoints(netStrokes, par);
      hasPoints = true;
    }
  }

  if (gross == null && grossPlayed > 0) gross = grossPlayed;

  const toPar =
    grossPlayed > 0 && parPlayed > 0 ? grossPlayed - parPlayed : detail.to_par;

  const netToPar =
    hasNetLine && parPlayed > 0
      ? netStrokesPlayed - parPlayed
      : toPar != null && catRule.scoring_format === "stroke_play"
        ? toPar - ph
        : null;

  return {
    gross: gross ?? null,
    toPar: toPar ?? null,
    netToPar,
    stablefordPoints: useNetStableford && hasPoints ? points : null,
  };
}

/** Acumulado hasta `maxRoundNo` según la base de clasificación de la categoría. */
export function cumulativeLeaderboardValue(
  details: RoundDetail[],
  rule: CategoryCompetitionRule,
  handicapIndex: number | null | undefined,
  maxRoundNo: number | null,
  strokeIndexByHole?: StrokeIndexByHole
): {
  sortValue: number | null;
  displayToPar: number | null;
  displayGross: number | null;
  stablefordTotal: number | null;
} {
  const catRule = normalizeCompetitionRule(rule);

  let totalGross = 0;
  let totalToPar = 0;
  let totalNetToPar = 0;
  let totalSf = 0;
  let hasGross = false;
  let hasToPar = false;
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
      handicapIndex,
      strokeIndexByHole
    );
    if (scored.gross != null) {
      totalGross += scored.gross;
      hasGross = true;
    }
    if (scored.toPar != null) {
      totalToPar += scored.toPar;
      hasToPar = true;
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

  const basis = catRule.leaderboard_basis;
  if ((basis === "net" || basis === "both") && hasNet) {
    return {
      sortValue: totalNetToPar,
      displayToPar: totalNetToPar,
      displayGross: hasGross ? totalGross : null,
      stablefordTotal: null,
    };
  }

  if (hasToPar) {
    return {
      sortValue: totalToPar,
      displayToPar: totalToPar,
      displayGross: hasGross ? totalGross : null,
      stablefordTotal: null,
    };
  }

  return {
    sortValue: hasGross ? totalGross : null,
    displayToPar: null,
    displayGross: hasGross ? totalGross : null,
    stablefordTotal: null,
  };
}
