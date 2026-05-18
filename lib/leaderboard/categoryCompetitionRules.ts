export type CategoryCompetitionRule = {
  category_id: string;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  prize_basis?: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number;
  gross_prize_places?: number;
  net_prize_places?: number | null;
  is_active: boolean;
};

export function categoryShowsGrossNetToggle(
  rule: CategoryCompetitionRule
): boolean {
  const r = normalizeCompetitionRule(rule);
  return (
    r.leaderboard_basis === "both" ||
    r.prize_basis === "both" ||
    (r.prize_basis === "gross" && r.leaderboard_basis === "net") ||
    (r.prize_basis === "net" && r.leaderboard_basis === "gross")
  );
}

export function rulesByCategoryId(
  rules: CategoryCompetitionRule[]
): Map<string, CategoryCompetitionRule> {
  const map = new Map<string, CategoryCompetitionRule>();
  for (const rule of rules) {
    if (!rule.is_active) continue;
    const id = String(rule.category_id ?? "").trim();
    if (!id) continue;
    map.set(id, normalizeCompetitionRule(rule));
  }
  return map;
}

/** Corrige filas guardadas como stroke_play + basis stableford (debe jugar Stableford). */
export function normalizeCompetitionRule(
  rule: CategoryCompetitionRule
): CategoryCompetitionRule {
  if (
    rule.scoring_format === "stroke_play" &&
    rule.leaderboard_basis === "stableford"
  ) {
    return { ...rule, scoring_format: "stableford" };
  }
  return rule;
}

export function isStablefordCategory(rule: CategoryCompetitionRule): boolean {
  const r = normalizeCompetitionRule(rule);
  return (
    r.scoring_format === "stableford" || r.leaderboard_basis === "stableford"
  );
}

/** @deprecated No usar en reportes: configurar regla en BD o bloquear vista. */
export function defaultRuleForCategory(
  categoryId: string | null
): CategoryCompetitionRule {
  return {
    category_id: categoryId ?? "",
    scoring_format: "stroke_play",
    leaderboard_basis: "gross",
    handicap_percentage: 100,
    is_active: true,
  };
}
