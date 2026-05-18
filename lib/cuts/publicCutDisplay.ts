import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  isStablefordCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import {
  higherIsBetterForCutRule,
  rankValueForAdvancementRule,
} from "./cutRanking";
import type { PublicCutLine, RoundAdvancementRule } from "./computeCutLine";
import {
  getAdvancementRulesForTargetRound,
  getInformationalAdvancementRulesForDisplay,
  primaryCutLineForCategory,
  ruleAppliesToRow,
} from "./computeCutLine";

type CategoryMeta = { id: string; code: string | null };

const SCOPE_PRIORITY: Record<RoundAdvancementRule["scope_type"], number> = {
  category: 0,
  category_code_list: 1,
  category_group: 2,
  overall: 3,
};

/** Una sola regla de corte por categoría (la más específica). */
export function pickPrimaryAdvancementRule(
  activeRules: RoundAdvancementRule[],
  row: Pick<LeaderboardRow, "category_id" | "category_code">,
  categories: CategoryMeta[]
): RoundAdvancementRule | null {
  const matching = activeRules.filter((r) =>
    ruleAppliesToRow(r, row as LeaderboardRow, categories)
  );
  if (matching.length === 0) return null;

  return [...matching].sort(
    (a, b) =>
      SCOPE_PRIORITY[a.scope_type] - SCOPE_PRIORITY[b.scope_type] ||
      (a.sort_order ?? 999) - (b.sort_order ?? 999)
  )[0]!;
}

function compareCutRank(
  a: number | null,
  b: number | null,
  higherIsBetter: boolean
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return higherIsBetter ? b - a : a - b;
}

/**
 * Ordena cada categoría según la misma métrica del corte (neto/gross/puntos),
 * para que la línea de corte quede en el lugar correcto.
 */
export function sortLeaderboardForCutAlignment(params: {
  rows: LeaderboardRow[];
  advancementRules: RoundAdvancementRule[];
  categories: CategoryMeta[];
  selectedRoundNo: number;
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  strokeIndexByHole?: StrokeIndexByHole;
}): LeaderboardRow[] {
  const enforcing = getAdvancementRulesForTargetRound(
    params.advancementRules,
    params.selectedRoundNo
  );
  const activeRules =
    enforcing.length > 0
      ? enforcing
      : getInformationalAdvancementRulesForDisplay(
          params.advancementRules,
          params.selectedRoundNo
        );
  if (activeRules.length === 0) return params.rows;

  const rulesMap = rulesByCategoryId(params.competitionRules);
  const groups = new Map<string, LeaderboardRow[]>();
  const categoryOrder: string[] = [];

  for (const row of params.rows) {
    const key = row.category_id ?? "__none__";
    if (!groups.has(key)) {
      groups.set(key, []);
      categoryOrder.push(key);
    }
    groups.get(key)!.push(row);
  }

  const sorted: LeaderboardRow[] = [];

  for (const catKey of categoryOrder) {
    const bucket = groups.get(catKey) ?? [];
    const sample = bucket[0];
    if (!sample) continue;

    const cutRule = pickPrimaryAdvancementRule(
      activeRules,
      sample,
      params.categories
    );

    if (!cutRule) {
      sorted.push(...bucket);
      continue;
    }

    const catRule = competitionRuleForCategory(rulesMap, sample.category_id);
    const higherIsBetter = higherIsBetterForCutRule(cutRule, catRule);

    const ranked = bucket.map((row) => {
      const v = rankValueForAdvancementRule(
        row,
        cutRule,
        params.selectedRoundNo,
        rulesMap,
        params.handicapByPlayerId,
        params.strokeIndexByHole
      );
      return { row, sortValue: v.primary };
    });

    ranked.sort((a, b) => {
      if (a.row.is_disqualified && !b.row.is_disqualified) return 1;
      if (!a.row.is_disqualified && b.row.is_disqualified) return -1;
      const cmp = compareCutRank(a.sortValue, b.sortValue, higherIsBetter);
      if (cmp !== 0) return cmp;
      const rowRule = competitionRuleForCategory(
        rulesMap,
        a.row.category_id
      );
      const hiDisplay = isStablefordCategory(rowRule);
      const av = a.row.leaderboard_sort_value;
      const bv = b.row.leaderboard_sort_value;
      if (av != null && bv != null && av !== bv) {
        return hiDisplay ? bv - av : av - bv;
      }
      return String(a.row.player_name ?? "").localeCompare(
        String(b.row.player_name ?? ""),
        "es"
      );
    });

    sorted.push(...ranked.map((r) => r.row));
  }

  return sorted;
}

/** Una sola línea de corte por categoría (antes de la primera fila que no pasó). */
export function annotateCutDividers(
  rows: LeaderboardRow[],
  cutLines: PublicCutLine[],
  selectedCategoryId: string | null
): LeaderboardRow[] {
  const dividerBefore = new Map<string, string>();

  const categoryKeys = [
    ...new Set(rows.map((r) => String(r.category_id ?? ""))),
  ];

  for (const catId of categoryKeys) {
    if (!catId) continue;
    const catRows = rows.filter((r) => String(r.category_id ?? "") === catId);
    const line = primaryCutLineForCategory(
      cutLines.filter((l) => l.categoryId === catId),
      catId
    );
    if (!line) continue;

    const label = selectedCategoryId
      ? line.label
      : line.categoryCode
        ? `${line.label} · ${line.categoryCode}`
        : line.label;

    for (let i = 0; i < catRows.length; i++) {
      const row = catRows[i]!;
      const prev = i > 0 ? catRows[i - 1] : null;
      const inCut = line.madeCutEntryIds.has(row.entry_id);
      const prevInCut = prev ? line.madeCutEntryIds.has(prev.entry_id) : false;
      if (!inCut && prevInCut) {
        dividerBefore.set(row.entry_id, label);
        break;
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    show_cut_divider: dividerBefore.has(row.entry_id),
    cut_divider_label: dividerBefore.get(row.entry_id) ?? null,
  }));
}

export function activeCutLineForUi(
  cutLines: PublicCutLine[],
  selectedCategoryId: string | null
): PublicCutLine | null {
  if (!selectedCategoryId) return null;
  return primaryCutLineForCategory(cutLines, selectedCategoryId);
}
