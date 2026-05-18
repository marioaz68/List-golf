import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import {
  compareByTieBreakSteps,
  type TieBreakStep,
} from "./tieBreak";
import {
  higherIsBetterForCutRule,
  rankValueForAdvancementRule,
} from "./cutRanking";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";

export type RoundAdvancementRule = {
  from_round_no: number;
  to_round_no: number;
  scope_type: "category" | "category_group" | "category_code_list" | "overall";
  scope_value: string;
  ranking_basis:
    | "gross_total"
    | "net_total"
    | "points_total"
    | "gross_round"
    | "net_round"
    | "points_round";
  ranking_mode: "tournament_to_date" | "specified_rounds" | "last_round_only";
  advancement_type: "top_n" | "top_percent" | "all";
  advancement_value: number;
  include_ties: boolean;
  gross_exemption_enabled?: boolean;
  gross_exemption_top_n?: number;
  tie_break_profile_id?: string | null;
  sort_order?: number | null;
  is_active: boolean;
};

export type PublicCutLine = {
  categoryId: string | null;
  categoryCode: string | null;
  afterPosition: number;
  label: string;
  madeCutEntryIds: Set<string>;
};

type CategoryMeta = { id: string; code: string | null };

type RankedCutPlayer = {
  entryId: string;
  playerId: string;
  primaryValue: number | null;
  grossValue: number | null;
  detail: ReturnType<typeof rankValueForAdvancementRule>["detail"];
};

function splitCodes(value: string) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function ruleAppliesToRow(
  rule: RoundAdvancementRule,
  row: LeaderboardRow,
  categories: CategoryMeta[]
): boolean {
  const code = (row.category_code ?? "").trim().toUpperCase();
  const id = String(row.category_id ?? "").trim();

  switch (rule.scope_type) {
    case "category":
      return id === String(rule.scope_value ?? "").trim();
    case "category_code_list":
      return splitCodes(rule.scope_value).some(
        (c) => c.toUpperCase() === code
      );
    case "category_group": {
      const group = String(rule.scope_value ?? "").trim().toUpperCase();
      if (!group) return false;
      const cat = categories.find((c) => c.id === id);
      const catCode = (cat?.code ?? code).toUpperCase();
      if (catCode === group) return true;
      /** Evita que grupo "D" aplique a DE y DC a la vez; solo prefijos de 2+ letras (ej. DA). */
      if (group.length >= 2 && catCode.startsWith(group)) {
        return true;
      }
      return false;
    }
    case "overall":
      return true;
    default:
      return false;
  }
}

function comparePrimary(
  a: RankedCutPlayer,
  b: RankedCutPlayer,
  higherIsBetter: boolean
): number {
  const av = a.primaryValue;
  const bv = b.primaryValue;
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  if (av === bv) return 0;
  return higherIsBetter ? bv - av : av - bv;
}

function sortCutField(
  players: RankedCutPlayer[],
  higherIsBetter: boolean,
  tieBreakSteps: TieBreakStep[],
  rulesMap: Map<string, CategoryCompetitionRule>,
  handicapByPlayerId: Map<string, number | null>,
  categoryId: string,
  strokeIndexByHole?: StrokeIndexByHole
): RankedCutPlayer[] {
  const catRule = competitionRuleForCategory(rulesMap, categoryId);

  return [...players].sort((a, b) => {
    const primary = comparePrimary(a, b, higherIsBetter);
    if (primary !== 0) return primary;

    if (tieBreakSteps.length > 0) {
      const tb = compareByTieBreakSteps(a.detail, b.detail, tieBreakSteps, {
        catRule,
        handicapIndexA: handicapByPlayerId.get(a.playerId) ?? null,
        handicapIndexB: handicapByPlayerId.get(b.playerId) ?? null,
        strokeIndexByHole,
      });
      if (tb !== 0) return tb;
    }

    if (a.grossValue != null && b.grossValue != null && a.grossValue !== b.grossValue) {
      return a.grossValue - b.grossValue;
    }

    return a.entryId.localeCompare(b.entryId);
  });
}

function topNFromRule(rule: RoundAdvancementRule, fieldSize: number): number {
  if (rule.advancement_type === "top_percent") {
    const pct = Math.max(0, Math.min(100, Number(rule.advancement_value)));
    return Math.max(1, Math.ceil((fieldSize * pct) / 100));
  }
  return Math.max(1, Math.trunc(Number(rule.advancement_value)));
}

function madeCutFromRanking(
  ranked: RankedCutPlayer[],
  rule: RoundAdvancementRule,
  higherIsBetter: boolean,
  tieBreakSteps: TieBreakStep[]
): Set<string> {
  const eligible = ranked.filter((r) => r.primaryValue != null);
  if (eligible.length === 0) return new Set();

  const topN = Math.min(topNFromRule(rule, eligible.length), eligible.length);

  if (tieBreakSteps.length > 0 || !rule.include_ties) {
    return new Set(eligible.slice(0, topN).map((r) => r.entryId));
  }

  const cutValue = eligible[topN - 1]!.primaryValue!;
  const ids = new Set<string>();
  for (const row of eligible) {
    if (row.primaryValue == null) continue;
    const makes = higherIsBetter
      ? row.primaryValue >= cutValue
      : row.primaryValue <= cutValue;
    if (makes) ids.add(row.entryId);
  }
  return ids;
}

function applyGrossExemption(
  madeCut: Set<string>,
  ranked: RankedCutPlayer[],
  rule: RoundAdvancementRule
): Set<string> {
  if (!rule.gross_exemption_enabled) return madeCut;
  const n = Math.max(0, Math.trunc(Number(rule.gross_exemption_top_n ?? 0)));
  if (n <= 0) return madeCut;

  const byGross = [...ranked]
    .filter((r) => r.grossValue != null)
    .sort((a, b) => (a.grossValue ?? 0) - (b.grossValue ?? 0));

  const next = new Set(madeCut);
  for (const row of byGross.slice(0, n)) {
    next.add(row.entryId);
  }
  return next;
}

function cutLabelForRule(
  rule: RoundAdvancementRule,
  selectedRoundNo: number,
  tieBreakSteps: TieBreakStep[]
): string {
  const tieNote =
    tieBreakSteps.length > 0
      ? " · desempate"
      : rule.include_ties
        ? " · empates"
        : "";

  if (rule.advancement_type === "all") {
    return `CORTE · Pasan todos (→ R${rule.to_round_no})`;
  }

  if (rule.advancement_type === "top_percent") {
    return `CORTE · Top ${rule.advancement_value}% (→ R${rule.to_round_no})${tieNote}`;
  }

  return `CORTE · Top ${rule.advancement_value} (→ R${rule.to_round_no})${tieNote}`;
}

function computeLineForRule(
  rule: RoundAdvancementRule,
  rowsInCat: LeaderboardRow[],
  categoryId: string,
  catCode: string | null,
  params: {
    selectedRoundNo: number;
    categories: CategoryMeta[];
    rulesMap: Map<string, CategoryCompetitionRule>;
    handicapByPlayerId: Map<string, number | null>;
    tieBreakStepsByProfileId: Map<string, TieBreakStep[]>;
    strokeIndexByHole?: StrokeIndexByHole;
  }
): PublicCutLine | null {
  const scoped = rowsInCat.filter((r) =>
    ruleAppliesToRow(rule, r, params.categories)
  );
  if (scoped.length === 0) return null;

  if (rule.advancement_type === "all") {
    return {
      categoryId,
      categoryCode: catCode,
      afterPosition: scoped.length,
      label: cutLabelForRule(rule, params.selectedRoundNo, []),
      madeCutEntryIds: new Set(scoped.map((r) => r.entry_id)),
    };
  }

  const catRule = competitionRuleForCategory(params.rulesMap, categoryId);
  const higherIsBetter = higherIsBetterForCutRule(rule, catRule);
  const tieBreakSteps = rule.tie_break_profile_id
    ? params.tieBreakStepsByProfileId.get(rule.tie_break_profile_id) ?? []
    : [];

  const ranked: RankedCutPlayer[] = scoped.map((row) => {
    const v = rankValueForAdvancementRule(
      row,
      rule,
      params.selectedRoundNo,
      params.rulesMap,
      params.handicapByPlayerId,
      params.strokeIndexByHole
    );
    return {
      entryId: row.entry_id,
      playerId: row.player_id,
      primaryValue: v.primary,
      grossValue: v.gross,
      detail: v.detail,
    };
  });

  const sorted = sortCutField(
    ranked,
    higherIsBetter,
    tieBreakSteps,
    params.rulesMap,
    params.handicapByPlayerId,
    categoryId,
    params.strokeIndexByHole
  );

  let madeCut = madeCutFromRanking(
    sorted,
    rule,
    higherIsBetter,
    tieBreakSteps
  );
  madeCut = applyGrossExemption(madeCut, sorted, rule);

  let afterPosition = 0;
  for (const row of sorted) {
    if (!madeCut.has(row.entryId)) break;
    afterPosition += 1;
  }
  if (afterPosition <= 0) return null;

  return {
    categoryId,
    categoryCode: catCode,
    afterPosition,
    label: cutLabelForRule(rule, params.selectedRoundNo, tieBreakSteps),
    madeCutEntryIds: madeCut,
  };
}

/** Combina varias líneas de corte de la misma categoría (intersección = deben cumplir todas). */
export function mergeCutLinesForCategory(
  lines: PublicCutLine[],
  categoryId: string | null
): PublicCutLine | null {
  const catLines = categoryId
    ? lines.filter((l) => l.categoryId === categoryId)
    : lines;
  if (catLines.length === 0) return null;
  if (catLines.length === 1) return catLines[0]!;

  let merged: Set<string> | null = null;
  for (const line of catLines) {
    if (merged === null) {
      merged = new Set(line.madeCutEntryIds);
    } else {
      for (const id of merged) {
        if (!line.madeCutEntryIds.has(id)) merged.delete(id);
      }
    }
  }

  const primary = catLines[0]!;
  const afterPosition = Math.min(...catLines.map((l) => l.afterPosition));

  return {
    categoryId: primary.categoryId,
    categoryCode: primary.categoryCode,
    afterPosition,
    label: catLines.map((l) => l.label).join(" · "),
    madeCutEntryIds: merged ?? new Set(),
  };
}

/**
 * Reglas de avance que aplican al generar salidas / ver clasificación de la ronda `targetRoundNo`.
 * Ej.: `to_round_no: 3` → corte tras R2 para entrar a la final; sin regla con `to_round_no: 2` → R2 sin corte.
 */
export function getAdvancementRulesForTargetRound(
  advancementRules: RoundAdvancementRule[],
  targetRoundNo: number
): RoundAdvancementRule[] {
  if (targetRoundNo <= 1) return [];
  return advancementRules
    .filter(
      (r) =>
        r.is_active &&
        r.to_round_no === targetRoundNo &&
        r.from_round_no < targetRoundNo
    )
    .sort(
      (a, b) =>
        (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
        a.from_round_no - b.from_round_no
    );
}

/**
 * Cortes activos al entrar a `selectedRoundNo` (p. ej. corte tras R1 al ver R2).
 */
export function computePublicCutLines(params: {
  leaderboard: LeaderboardRow[];
  advancementRules: RoundAdvancementRule[];
  competitionRules: CategoryCompetitionRule[];
  categories: CategoryMeta[];
  selectedRoundNo: number;
  selectedCategoryId: string | null;
  handicapByPlayerId: Map<string, number | null>;
  tieBreakStepsByProfileId: Map<string, TieBreakStep[]>;
  strokeIndexByHole?: StrokeIndexByHole;
}): PublicCutLine[] {
  const { leaderboard, selectedRoundNo } = params;
  if (selectedRoundNo <= 1) return [];

  const activeRules = getAdvancementRulesForTargetRound(
    params.advancementRules,
    selectedRoundNo
  );

  if (activeRules.length === 0) return [];

  const rulesMap = rulesByCategoryId(params.competitionRules);
  const rawLines: PublicCutLine[] = [];

  const categoryScopeIds = params.selectedCategoryId
    ? [params.selectedCategoryId]
    : [
        ...new Set(
          leaderboard
            .map((r) => String(r.category_id ?? "").trim())
            .filter(Boolean)
        ),
      ];

  const shared = {
    selectedRoundNo,
    categories: params.categories,
    rulesMap,
    handicapByPlayerId: params.handicapByPlayerId,
    tieBreakStepsByProfileId: params.tieBreakStepsByProfileId,
    strokeIndexByHole: params.strokeIndexByHole,
  };

  for (const categoryId of categoryScopeIds) {
    const rowsInCat = leaderboard.filter(
      (r) =>
        !r.is_disqualified &&
        String(r.category_id ?? "") === categoryId
    );
    if (rowsInCat.length === 0) continue;

    const catCode =
      rowsInCat[0]?.category_code ??
      params.categories.find((c) => c.id === categoryId)?.code ??
      null;

    const sampleRow = rowsInCat[0]!;
    const matchingRules = activeRules.filter((r) =>
      ruleAppliesToRow(r, sampleRow, params.categories)
    );
    if (matchingRules.length === 0) continue;

    const linesForCategory: PublicCutLine[] = [];
    for (const rule of matchingRules) {
      const line = computeLineForRule(
        rule,
        rowsInCat,
        categoryId,
        catCode,
        shared
      );
      if (line) linesForCategory.push(line);
    }

    const merged = mergeCutLinesForCategory(linesForCategory, categoryId);
    if (merged) rawLines.push(merged);
  }

  return rawLines;
}

export function primaryCutLineForCategory(
  lines: PublicCutLine[],
  categoryId: string | null
): PublicCutLine | null {
  if (!categoryId) return null;
  return mergeCutLinesForCategory(lines, categoryId);
}

export { ruleAppliesToRow };
