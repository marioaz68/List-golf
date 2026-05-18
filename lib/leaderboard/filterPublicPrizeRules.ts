export type PublicPrizeRuleRow = {
  id: string;
  scope_type: "overall" | "category_group" | "category_code_list" | "category";
  scope_value: string;
  prize_label: string;
  prize_position: number;
  ranking_basis: "gross" | "net" | "stableford";
  priority: number;
  show_on_leaderboard: boolean;
  sort_order: number | null;
  is_active: boolean;
};

export function filterPublicPrizeRulesForCategory({
  rules,
  categoryId,
  categoryCode,
  categoryGroup,
}: {
  rules: PublicPrizeRuleRow[];
  categoryId: string;
  categoryCode: string;
  categoryGroup?: string | null;
}): PublicPrizeRuleRow[] {
  const code = categoryCode.trim().toUpperCase();
  const group = String(categoryGroup ?? "").trim().toUpperCase();

  return rules
    .filter((r) => r.is_active && r.show_on_leaderboard)
    .filter((r) => {
      const scope = String(r.scope_value ?? "").trim();
      switch (r.scope_type) {
        case "overall":
          return true;
        case "category":
          return scope === categoryId;
        case "category_code_list": {
          const codes = scope
            .split(/[,;|\s]+/)
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);
          return codes.includes(code);
        }
        case "category_group":
          return group.length > 0 && scope.toUpperCase() === group;
        default:
          return false;
      }
    })
    .sort((a, b) => {
      const sa = a.sort_order ?? a.priority ?? a.prize_position;
      const sb = b.sort_order ?? b.priority ?? b.prize_position;
      if (sa !== sb) return sa - sb;
      return a.prize_position - b.prize_position;
    });
}
