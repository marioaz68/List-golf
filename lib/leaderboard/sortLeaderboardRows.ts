import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  isStablefordCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";
import { competitionRuleForCategory } from "./resolveCompetitionRule";
import type { LeaderboardViewOverride } from "./leaderboardViewOverride";

export function compareLeaderboardRows(
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

  const atp = a.total_to_par;
  const btp = b.total_to_par;
  if (atp != null && btp != null) {
    if (atp !== btp) return atp - btp;
  } else if (atp != null) return -1;
  else if (btp != null) return 1;

  return String(a.player_name ?? "").localeCompare(
    String(b.player_name ?? ""),
    "es"
  );
}

/** Orden de tabla: mejor → peor según métrica de competencia (to-par / net / puntos). */
export function sortLeaderboardByCompetitionOrder(
  rows: LeaderboardRow[],
  competitionRules: CategoryCompetitionRule[]
): LeaderboardRow[] {
  const rulesMap = rulesByCategoryId(competitionRules);
  const groups = new Map<string, LeaderboardRow[]>();

  for (const row of rows) {
    const key = row.category_id ?? "__none__";
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  const sorted: LeaderboardRow[] = [];

  for (const [, bucket] of groups) {
    const rule = competitionRuleForCategory(
      rulesMap,
      bucket[0]?.category_id ?? null
    );
    const higherIsBetter =
      rule.scoring_format === "stableford" ||
      rule.leaderboard_basis === "stableford";
    bucket.sort((a, b) => compareLeaderboardRows(a, b, higherIsBetter));
    sorted.push(...bucket);
  }

  sorted.sort((a, b) => {
    const catA = a.category_code ?? "";
    const catB = b.category_code ?? "";
    if (catA !== catB) {
      return catA.localeCompare(catB, "es", { sensitivity: "base" });
    }
    const rule = competitionRuleForCategory(rulesMap, a.category_id);
    return compareLeaderboardRows(a, b, isStablefordCategory(rule));
  });

  return sorted;
}
