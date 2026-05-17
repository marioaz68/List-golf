export type CategoryCompetitionRule = {
  category_id: string;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number;
  is_active: boolean;
};

export function rulesByCategoryId(
  rules: CategoryCompetitionRule[]
): Map<string, CategoryCompetitionRule> {
  const map = new Map<string, CategoryCompetitionRule>();
  for (const rule of rules) {
    if (!rule.is_active) continue;
    const id = String(rule.category_id ?? "").trim();
    if (!id) continue;
    map.set(id, rule);
  }
  return map;
}

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
