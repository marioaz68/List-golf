import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import { rulesByCategoryId } from "@/lib/leaderboard/categoryCompetitionRules";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import { detailScoreColumnLabels } from "@/lib/leaderboard/competitionDisplay";
import type { PublicDetailTableLabels } from "./publicDetailTableLabels";

export function buildHandicapMap(
  record: Record<string, number | null>
): Map<string, number | null> {
  return new Map(Object.entries(record));
}

export function buildCompetitionRulesMap(
  rules: CategoryCompetitionRule[]
): Map<string, CategoryCompetitionRule> {
  return rulesByCategoryId(rules);
}

export function ruleForCategory(
  rulesMap: Map<string, CategoryCompetitionRule>,
  categoryId: string | null | undefined
): CategoryCompetitionRule {
  return competitionRuleForCategory(rulesMap, categoryId);
}

export function detailLabelsWithCompetitionRule(
  base: PublicDetailTableLabels,
  rule: CategoryCompetitionRule
): PublicDetailTableLabels {
  const cols = detailScoreColumnLabels(rule);
  return {
    ...base,
    gross: cols.primary,
    toPar: cols.secondary,
  };
}
