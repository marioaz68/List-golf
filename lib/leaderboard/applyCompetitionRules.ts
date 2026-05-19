import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  isStablefordCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";
import { competitionRuleForCategory } from "./resolveCompetitionRule";
import {
  cumulativeLeaderboardValue,
  type StrokeIndexByHole,
} from "./competitionScoring";
import type { LockedScorecardLookups, RoundIdMeta } from "./lockedScorecards";
import type { LeaderboardViewOverride } from "./leaderboardViewOverride";
import { detailsForPublicCumulative } from "./publicRoundScorePolicy";

export function applyCompetitionRules({
  leaderboard,
  competitionRules,
  handicapByPlayerId,
  maxRoundNo,
  strokeIndexByHole,
  leaderboardViewOverride = null,
  lockedLookups,
  roundsForLock,
  includeIncompleteRounds = false,
}: {
  leaderboard: LeaderboardRow[];
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  maxRoundNo: number | null;
  strokeIndexByHole?: StrokeIndexByHole;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
  lockedLookups?: LockedScorecardLookups;
  roundsForLock?: RoundIdMeta[];
  /** Live: totales y orden con captura parcial (R1 + avance de R2, etc.). */
  includeIncompleteRounds?: boolean;
}): LeaderboardRow[] {
  const rulesMap = rulesByCategoryId(competitionRules);

  const enriched = leaderboard.map((row) => {
    const rule = competitionRuleForCategory(rulesMap, row.category_id);

    const hcp = handicapByPlayerId.get(row.player_id) ?? null;
    const detailsForCum =
      !includeIncompleteRounds && lockedLookups && roundsForLock
        ? detailsForPublicCumulative(
            row.details,
            row.entry_id,
            row.category_id,
            roundsForLock,
            lockedLookups
          )
        : row.details;
    const cum = cumulativeLeaderboardValue(
      detailsForCum,
      rule,
      hcp,
      maxRoundNo,
      strokeIndexByHole,
      leaderboardViewOverride
    );

    return {
      ...row,
      scoring_format: rule.scoring_format,
      leaderboard_basis: rule.leaderboard_basis,
      total_to_par: row.is_disqualified ? null : cum.displayToPar,
      total_gross: row.is_disqualified ? null : cum.displayGross ?? row.total_gross,
      leaderboard_sort_value: row.is_disqualified ? null : cum.sortValue,
      stableford_total: cum.stablefordTotal,
    };
  });

  const groups = new Map<string, LeaderboardRow[]>();
  for (const row of enriched) {
    const key = row.category_id ?? "__none__";
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const sorted: LeaderboardRow[] = [];

  for (const [, rows] of groups) {
    const rule = competitionRuleForCategory(
      rulesMap,
      rows[0]?.category_id ?? null
    );

    const higherIsBetter =
      rule.scoring_format === "stableford" ||
      rule.leaderboard_basis === "stableford";

    rows.sort((a, b) => compareRows(a, b, higherIsBetter));
    sorted.push(...rows);
  }

  sorted.sort((a, b) => {
    const catA = a.category_code ?? "";
    const catB = b.category_code ?? "";
    if (catA !== catB) {
      return catA.localeCompare(catB, "es", { sensitivity: "base" });
    }
    const rule = competitionRuleForCategory(rulesMap, a.category_id);
    return compareRows(a, b, isStablefordCategory(rule));
  });

  return sorted;
}

function compareRows(
  a: LeaderboardRow,
  b: LeaderboardRow,
  higherIsBetter: boolean
): number {
  if (a.is_disqualified && !b.is_disqualified) return 1;
  if (!a.is_disqualified && b.is_disqualified) return -1;

  const av = a.leaderboard_sort_value;
  const bv = b.leaderboard_sort_value;

  if (av != null && bv != null) {
    if (av !== bv) return higherIsBetter ? bv - av : av - bv;
  } else if (av != null) return -1;
  else if (bv != null) return 1;

  if (a.selected_round_position_category != null && b.selected_round_position_category != null) {
    return a.selected_round_position_category - b.selected_round_position_category;
  }

  return String(a.player_name ?? "").localeCompare(
    String(b.player_name ?? ""),
    "es"
  );
}
