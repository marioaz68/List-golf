import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  isStablefordCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import type { LeaderboardViewOverride } from "@/lib/leaderboard/leaderboardViewOverride";
import { compareLeaderboardRows } from "@/lib/leaderboard/sortLeaderboardRows";
import {
  higherIsBetterForCutRule,
  rankValueForAdvancementRule,
  type CutRankingOptions,
} from "./cutRanking";
import type { PublicCutLine, RoundAdvancementRule } from "./computeCutLine";
import {
  getAdvancementRulesForTargetRound,
  getInformationalAdvancementRulesForDisplay,
  pickPrimaryAdvancementRule,
  primaryCutLineForCategory,
} from "./computeCutLine";

export { pickPrimaryAdvancementRule };

type CategoryMeta = { id: string; code: string | null };

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

function advancementRulesForCutDisplay(
  advancementRules: RoundAdvancementRule[],
  selectedRoundNo: number
): RoundAdvancementRule[] {
  const enforcing = getAdvancementRulesForTargetRound(
    advancementRules,
    selectedRoundNo
  );
  if (enforcing.length > 0) return enforcing;
  return getInformationalAdvancementRulesForDisplay(
    advancementRules,
    selectedRoundNo
  );
}

function sortBucketByCutMetric(
  bucket: LeaderboardRow[],
  cutRule: RoundAdvancementRule,
  params: {
    selectedRoundNo: number;
    rulesMap: Map<string, CategoryCompetitionRule>;
    handicapByPlayerId: Map<string, number | null>;
    strokeIndexByHole?: StrokeIndexByHole;
    leaderboardViewOverride?: LeaderboardViewOverride | null;
    cutRankingOptions?: CutRankingOptions;
  }
): LeaderboardRow[] {
  const sample = bucket[0];
  if (!sample) return bucket;

  const catRule = competitionRuleForCategory(params.rulesMap, sample.category_id);
  const higherIsBetterCut = higherIsBetterForCutRule(
    cutRule,
    catRule,
    params.leaderboardViewOverride
  );
  const rowRule = competitionRuleForCategory(params.rulesMap, sample.category_id);
  const hiDisplay = isStablefordCategory(rowRule);

  const ranked = bucket.map((row) => {
    const v = rankValueForAdvancementRule(
      row,
      cutRule,
      params.selectedRoundNo,
      params.rulesMap,
      params.handicapByPlayerId,
      params.strokeIndexByHole,
      params.leaderboardViewOverride,
      params.cutRankingOptions
    );
    return { row, cutSortValue: v.primary };
  });

  ranked.sort((a, b) => {
    if (a.row.is_disqualified && !b.row.is_disqualified) return 1;
    if (!a.row.is_disqualified && b.row.is_disqualified) return -1;

    const cmp = compareCutRank(a.cutSortValue, b.cutSortValue, higherIsBetterCut);
    if (cmp !== 0) return cmp;

    const displayCmp = compareLeaderboardRows(a.row, b.row, hiDisplay);
    if (displayCmp !== 0) return displayCmp;

    return String(a.row.player_name ?? "").localeCompare(
      String(b.row.player_name ?? ""),
      "es"
    );
  });

  return ranked.map((r) => r.row);
}

/**
 * Ordena: primero quienes pasan el corte (por métrica de corte), luego el resto (por to-par en tabla).
 * Así la línea queda exactamente tras el cupo (p. ej. 35 de 70), no tras el orden solo de la tabla.
 */
export function orderLeaderboardForCutDisplay(params: {
  rows: LeaderboardRow[];
  cutLines: PublicCutLine[];
  advancementRules: RoundAdvancementRule[];
  categories: CategoryMeta[];
  selectedRoundNo: number;
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  strokeIndexByHole?: StrokeIndexByHole;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
  cutRankingOptions?: CutRankingOptions;
}): LeaderboardRow[] {
  if (params.cutLines.length === 0) return params.rows;

  const activeRules = advancementRulesForCutDisplay(
    params.advancementRules,
    params.selectedRoundNo
  );
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
    const line = primaryCutLineForCategory(
      params.cutLines.filter((l) => l.categoryId === catKey),
      catKey
    );
    if (!line) {
      sorted.push(...bucket);
      continue;
    }

    const sample = bucket[0];
    const cutRule =
      sample && activeRules.length > 0
        ? pickPrimaryAdvancementRule(activeRules, sample, params.categories)
        : null;

    const pass: LeaderboardRow[] = [];
    const fail: LeaderboardRow[] = [];
    for (const row of bucket) {
      if (line.madeCutEntryIds.has(row.entry_id)) pass.push(row);
      else fail.push(row);
    }

    const sortParams = {
      selectedRoundNo: params.selectedRoundNo,
      rulesMap,
      handicapByPlayerId: params.handicapByPlayerId,
      strokeIndexByHole: params.strokeIndexByHole,
      leaderboardViewOverride: params.leaderboardViewOverride,
      cutRankingOptions: params.cutRankingOptions,
    };

    const passSorted = cutRule
      ? sortBucketByCutMetric(pass, cutRule, sortParams)
      : pass;
    const failSorted = cutRule
      ? sortBucketByCutMetric(fail, cutRule, sortParams)
      : fail;

    sorted.push(...passSorted, ...failSorted);
  }

  return sorted;
}

/** @deprecated Use orderLeaderboardForCutDisplay */
export function sortLeaderboardForCutAlignment(params: {
  rows: LeaderboardRow[];
  advancementRules: RoundAdvancementRule[];
  categories: CategoryMeta[];
  selectedRoundNo: number;
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  strokeIndexByHole?: StrokeIndexByHole;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
  alignWithLeaderboardDisplay?: boolean;
}): LeaderboardRow[] {
  return params.rows;
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
