import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  defaultRuleForCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";
import { cumulativeLeaderboardValue } from "./competitionScoring";

export function applyCompetitionRules({
  leaderboard,
  competitionRules,
  handicapByPlayerId,
  maxRoundNo,
}: {
  leaderboard: LeaderboardRow[];
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  maxRoundNo: number | null;
}): LeaderboardRow[] {
  const rulesMap = rulesByCategoryId(competitionRules);

  const enriched = leaderboard.map((row) => {
    const rule =
      rulesMap.get(String(row.category_id ?? "")) ??
      defaultRuleForCategory(row.category_id);

    const hcp = handicapByPlayerId.get(row.player_id) ?? null;
    const cum = cumulativeLeaderboardValue(
      row.details,
      rule,
      hcp,
      maxRoundNo
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
    const rule =
      rulesMap.get(String(rows[0]?.category_id ?? "")) ??
      defaultRuleForCategory(rows[0]?.category_id ?? null);

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
    const rule =
      rulesMap.get(String(a.category_id ?? "")) ??
      defaultRuleForCategory(a.category_id);
    const higherIsBetter =
      rule.scoring_format === "stableford" ||
      rule.leaderboard_basis === "stableford";
    return compareRows(a, b, higherIsBetter);
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
