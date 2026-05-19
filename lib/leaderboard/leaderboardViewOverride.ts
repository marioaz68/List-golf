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

/** Clasificación principal neto vs gross (misma lógica que la vista de detalle). */
export function effectiveUsesNetLeaderboard(
  rule: CategoryCompetitionRule,
  override: LeaderboardViewOverride | null | undefined
): boolean {
  if (isStablefordCategory(rule)) return false;
  return !usesGrossHoleByHoleDetail(rule, override);
}

/**
 * Detalle expandido hoyo por hoyo: una fila Par y R1…Rn (sin handicap ni neto).
 * Aplica a categorías gross, both (por defecto) y cuando el toggle está en Gross.
 */
export function usesGrossHoleByHoleDetail(
  rule: CategoryCompetitionRule,
  override?: LeaderboardViewOverride | null
): boolean {
  if (isStablefordCategory(rule)) return false;
  if (override === "net") return false;
  if (override === "gross") return true;
  if (rule.leaderboard_basis === "gross") return true;
  if (rule.leaderboard_basis === "net") return false;
  return true;
}
