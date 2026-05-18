import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import {
  isStablefordCategory,
  rulesByCategoryId,
} from "@/lib/leaderboard/categoryCompetitionRules";
export type RulesBlockerCode =
  | "service_role_not_configured"
  | "competition_rules_load_failed"
  | "cut_rules_load_failed"
  | "categories_missing_competition_rule"
  | "competition_rule_invalid_config"
  | "course_stroke_index_incomplete";

export type RulesBlocker = {
  code: RulesBlockerCode;
  params?: Record<string, string | number>;
};

type CategoryMeta = { id: string; code: string | null };

function competitionRuleIssues(rule: CategoryCompetitionRule): string[] {
  const issues: string[] = [];
  if (
    rule.scoring_format === "stroke_play" &&
    rule.leaderboard_basis === "stableford"
  ) {
    issues.push("stroke_play + leaderboard stableford");
  }
  if (
    rule.scoring_format === "stableford" &&
    rule.leaderboard_basis !== "stableford"
  ) {
    issues.push("stableford + leaderboard distinto de stableford");
  }
  const pct = Number(rule.handicap_percentage);
  if (!Number.isFinite(pct) || pct < 0 || pct > 150) {
    issues.push("handicap_percentage fuera de rango");
  }
  return issues;
}

function categoryNeedsStrokeIndex(rule: CategoryCompetitionRule): boolean {
  return (
    isStablefordCategory(rule) ||
    rule.leaderboard_basis === "net" ||
    rule.leaderboard_basis === "both"
  );
}

/** Bloqueos: sin resolverlos no se debe mostrar clasificación con reglas inventadas. */
export function collectRulesBlockers({
  categories,
  categoryIdsWithPlayers,
  competitionRules,
  serviceRoleConfigured,
  competitionRulesLoadFailed,
  competitionRulesLoadError,
  cutRulesLoadFailed,
  cutRulesLoadError,
  strokeIndexHoleCount,
  selectedRoundNo,
}: {
  categories: CategoryMeta[];
  categoryIdsWithPlayers: Set<string>;
  competitionRules: CategoryCompetitionRule[];
  serviceRoleConfigured: boolean;
  competitionRulesLoadFailed: boolean;
  competitionRulesLoadError?: string | null;
  cutRulesLoadFailed: boolean;
  cutRulesLoadError?: string | null;
  strokeIndexHoleCount: number;
  selectedRoundNo: number;
}): RulesBlocker[] {
  const blockers: RulesBlocker[] = [];

  if (!serviceRoleConfigured) {
    blockers.push({ code: "service_role_not_configured" });
    return blockers;
  }

  if (competitionRulesLoadFailed) {
    blockers.push({
      code: "competition_rules_load_failed",
      params: competitionRulesLoadError
        ? { detail: competitionRulesLoadError }
        : undefined,
    });
    return blockers;
  }

  const rulesMap = rulesByCategoryId(competitionRules);
  const missingCodes: string[] = [];
  const invalidLabels: string[] = [];
  let needsStrokeIndex = false;

  for (const cat of categories) {
    const id = String(cat.id ?? "").trim();
    if (!id || !categoryIdsWithPlayers.has(id)) continue;

    const rule = rulesMap.get(id);
    const label = String(cat.code ?? id.slice(0, 8)).trim() || id.slice(0, 8);

    if (!rule) {
      missingCodes.push(label);
      continue;
    }

    const issues = competitionRuleIssues(rule);
    if (issues.length > 0) {
      invalidLabels.push(`${label} (${issues.join("; ")})`);
    }

    if (categoryNeedsStrokeIndex(rule)) {
      needsStrokeIndex = true;
    }
  }

  if (missingCodes.length > 0) {
    blockers.push({
      code: "categories_missing_competition_rule",
      params: { codes: missingCodes.join(", ") },
    });
  }

  if (invalidLabels.length > 0) {
    blockers.push({
      code: "competition_rule_invalid_config",
      params: { details: invalidLabels.join(" · ") },
    });
  }

  if (needsStrokeIndex && strokeIndexHoleCount < 18) {
    blockers.push({
      code: "course_stroke_index_incomplete",
      params: { count: strokeIndexHoleCount },
    });
  }

  if (selectedRoundNo > 1 && cutRulesLoadFailed) {
    blockers.push({
      code: "cut_rules_load_failed",
      params: cutRulesLoadError ? { detail: cutRulesLoadError } : undefined,
    });
  }

  return blockers;
}

export function hasRulesBlockers(blockers: RulesBlocker[]): boolean {
  return blockers.length > 0;
}
