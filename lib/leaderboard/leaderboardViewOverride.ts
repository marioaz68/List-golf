import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";

export type LeaderboardViewOverride = "gross" | "net";

export function parseLeaderboardViewOverride(
  value: string | undefined
): LeaderboardViewOverride | null {
  const v = String(value ?? "").trim().toLowerCase();
  if (v === "gross" || v === "net") return v;
  return null;
}

/** Clasificación principal neto vs gross (no aplica a Stableford). */
export function effectiveUsesNetLeaderboard(
  rule: CategoryCompetitionRule,
  override: LeaderboardViewOverride | null | undefined
): boolean {
  if (isStablefordCategory(rule)) return false;
  if (override === "net") return true;
  if (override === "gross") return false;
  const basis = rule.leaderboard_basis;
  return basis === "net" || basis === "both";
}
