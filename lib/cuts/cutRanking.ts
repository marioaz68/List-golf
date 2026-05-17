import type { LeaderboardRow, RoundDetail } from "@/app/torneos/[id]/lib/types";
import {
  cumulativeInRoundRange,
  higherIsBetterForRankingBasis,
  primaryFromRankingBasis,
  type CutRankingBasis,
} from "@/lib/leaderboard/cumulativeInRoundRange";
import {
  defaultRuleForCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { collectRoundIdsWithScoreCapture } from "@/lib/leaderboard/roundCategoryMatch";
import { resolveDetailForRoundNo } from "@/lib/leaderboard/roundCategoryMatch";
import type { RoundAdvancementRule } from "./computeCutLine";

export function rankingRoundRange(
  rule: RoundAdvancementRule,
  selectedRoundNo: number
): { minRound: number; maxRound: number; tieBreakRound: number } {
  if (rule.ranking_mode === "tournament_to_date") {
    const maxRound = Math.max(1, selectedRoundNo);
    return { minRound: 1, maxRound, tieBreakRound: maxRound };
  }

  if (rule.ranking_mode === "last_round_only") {
    const r = Math.max(1, rule.from_round_no);
    return { minRound: r, maxRound: r, tieBreakRound: r };
  }

  /** Rango De/A: acumula desde `from_round_no` hasta la ronda previa al avance (`to_round_no - 1`). */
  const minRound = Math.max(1, rule.from_round_no);
  const endInclusive = Math.max(
    minRound,
    Math.min(rule.to_round_no - 1, selectedRoundNo - 1, selectedRoundNo)
  );
  return {
    minRound,
    maxRound: endInclusive,
    tieBreakRound: endInclusive,
  };
}

function roundDetailForRow(
  row: LeaderboardRow,
  roundNo: number
): RoundDetail | null {
  const scoreRoundIds = collectRoundIdsWithScoreCapture(row.details);
  return resolveDetailForRoundNo(
    row.details,
    roundNo,
    row.category_id,
    scoreRoundIds
  );
}

export function rankValueForAdvancementRule(
  row: LeaderboardRow,
  rule: RoundAdvancementRule,
  selectedRoundNo: number,
  rulesMap: Map<string, CategoryCompetitionRule>,
  handicapByPlayerId: Map<string, number | null>
): {
  primary: number | null;
  gross: number | null;
  detail: RoundDetail | null;
} {
  const catRule =
    rulesMap.get(String(row.category_id ?? "")) ??
    defaultRuleForCategory(row.category_id);
  const hcp = handicapByPlayerId.get(row.player_id) ?? null;
  const { minRound, maxRound, tieBreakRound } = rankingRoundRange(
    rule,
    selectedRoundNo
  );
  const basis = rule.ranking_basis as CutRankingBasis;
  const detail = roundDetailForRow(row, tieBreakRound);

  const isSingleRound =
    basis === "gross_round" ||
    basis === "net_round" ||
    basis === "points_round";

  const rangeMin = isSingleRound ? tieBreakRound : minRound;
  const rangeMax = isSingleRound ? tieBreakRound : maxRound;

  const totals = cumulativeInRoundRange(
    row.details,
    catRule,
    hcp,
    rangeMin,
    rangeMax
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
