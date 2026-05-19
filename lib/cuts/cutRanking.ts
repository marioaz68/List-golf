import type { LeaderboardRow, RoundDetail } from "@/app/torneos/[id]/lib/types";
import {
  cumulativeInRoundRange,
  higherIsBetterForRankingBasis,
  primaryFromRankingBasis,
  type CutRankingBasis,
} from "@/lib/leaderboard/cumulativeInRoundRange";
import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import type { LeaderboardViewOverride } from "@/lib/leaderboard/leaderboardViewOverride";
import { effectiveUsesNetLeaderboard } from "@/lib/leaderboard/leaderboardViewOverride";
import { detailsForPublicCumulative } from "@/lib/leaderboard/publicRoundScorePolicy";
import type {
  LockedScorecardLookups,
  RoundIdMeta,
} from "@/lib/leaderboard/lockedScorecards";
import { collectRoundIdsWithScoreCapture } from "@/lib/leaderboard/roundCategoryMatch";
import { resolveDetailForRoundNo } from "@/lib/leaderboard/roundCategoryMatch";
import type { RoundAdvancementRule } from "./computeCutLine";

export type CutRankingOptions = {
  /** Solo tarjetas cerradas (clasificación oficial R1+R2), no captura en vivo parcial. */
  useClosedRoundClassification?: boolean;
  lockedLookups?: LockedScorecardLookups;
  roundsForLock?: RoundIdMeta[];
};

function detailsForCutRanking(
  row: LeaderboardRow,
  options?: CutRankingOptions
): RoundDetail[] {
  if (
    options?.useClosedRoundClassification &&
    options.lockedLookups &&
    options.roundsForLock?.length
  ) {
    return detailsForPublicCumulative(
      row.details,
      row.entry_id,
      row.category_id,
      options.roundsForLock,
      options.lockedLookups
    );
  }
  return row.details;
}

/** Alinea base del corte con la modalidad de la categoría (Stableford → puntos). */
export function effectiveRankingBasis(
  rule: RoundAdvancementRule,
  catRule: CategoryCompetitionRule,
  leaderboardViewOverride?: LeaderboardViewOverride | null
): CutRankingBasis {
  const basis = rule.ranking_basis as CutRankingBasis;

  if (isStablefordCategory(catRule)) {
    if (basis === "gross_round" || basis === "net_round") return "points_round";
    return "points_total";
  }

  if (!effectiveUsesNetLeaderboard(catRule, leaderboardViewOverride)) {
    return basis;
  }
  if (basis === "gross_total") return "net_total";
  if (basis === "gross_round") return "net_round";
  return basis;
}

export function higherIsBetterForCutRule(
  rule: RoundAdvancementRule,
  catRule: CategoryCompetitionRule,
  leaderboardViewOverride?: LeaderboardViewOverride | null
): boolean {
  return higherIsBetterForRankingBasis(
    effectiveRankingBasis(rule, catRule, leaderboardViewOverride)
  );
}

export function rankingRoundRange(
  rule: RoundAdvancementRule,
  selectedRoundNo: number,
  options?: CutRankingOptions
): { minRound: number; maxRound: number; tieBreakRound: number } {
  if (rule.ranking_mode === "tournament_to_date") {
    const maxRound = Math.max(1, selectedRoundNo);
    return { minRound: 1, maxRound, tieBreakRound: maxRound };
  }

  if (rule.ranking_mode === "last_round_only") {
    const r = Math.max(1, rule.from_round_no);
    return { minRound: r, maxRound: r, tieBreakRound: r };
  }

  /** Acumulado hasta la ronda previa al avance (p. ej. corte tras R1+R2 → `to_round_no` 3 usa hoyos 1–2). */
  const minRound = Math.max(1, rule.from_round_no);
  const cutThroughRound = Math.max(minRound, rule.to_round_no - 1);
  let endInclusive = Math.max(
    minRound,
    Math.min(cutThroughRound, selectedRoundNo)
  );
  if (
    options?.useClosedRoundClassification &&
    rule.ranking_mode === "specified_rounds" &&
    selectedRoundNo >= cutThroughRound
  ) {
    endInclusive = cutThroughRound;
  }
  return {
    minRound,
    maxRound: endInclusive,
    tieBreakRound: endInclusive,
  };
}

export function rankValueForAdvancementRule(
  row: LeaderboardRow,
  rule: RoundAdvancementRule,
  selectedRoundNo: number,
  rulesMap: Map<string, CategoryCompetitionRule>,
  handicapByPlayerId: Map<string, number | null>,
  strokeIndexByHole?: StrokeIndexByHole,
  leaderboardViewOverride?: LeaderboardViewOverride | null,
  options?: CutRankingOptions
): {
  primary: number | null;
  gross: number | null;
  detail: RoundDetail | null;
} {
  const catRule = competitionRuleForCategory(rulesMap, row.category_id);
  const hcp = handicapByPlayerId.get(row.player_id) ?? null;
  const { minRound, maxRound, tieBreakRound } = rankingRoundRange(
    rule,
    selectedRoundNo,
    options
  );
  const basis = effectiveRankingBasis(rule, catRule, leaderboardViewOverride);
  const details = detailsForCutRanking(row, options);
  const scoreRoundIds = collectRoundIdsWithScoreCapture(details);
  const detail = resolveDetailForRoundNo(
    details,
    tieBreakRound,
    row.category_id,
    scoreRoundIds
  );

  const isSingleRound =
    basis === "gross_round" ||
    basis === "net_round" ||
    basis === "points_round";

  const rangeMin = isSingleRound ? tieBreakRound : minRound;
  const rangeMax = isSingleRound ? tieBreakRound : maxRound;

  const totals = cumulativeInRoundRange(
    details,
    catRule,
    hcp,
    rangeMin,
    rangeMax,
    strokeIndexByHole
  );

  if (isSingleRound && !detail) {
    return { primary: null, gross: null, detail: null };
  }

  const primary = primaryFromRankingBasis(basis, totals);

  return {
    primary,
    gross: totals.grossTotal,
    detail,
  };
}

export { higherIsBetterForRankingBasis };
