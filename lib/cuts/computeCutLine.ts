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
  categoryIdsForCutComputation,
  cutSlotsFromRule,
  entryIdsMakingCut,
} from "./cutAdvancementPolicy";
import type { LeaderboardViewOverride } from "@/lib/leaderboard/leaderboardViewOverride";
import type { LockedScorecardLookups, RoundIdMeta } from "@/lib/leaderboard/lockedScorecards";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import {
  higherIsBetterForCutRule,
  rankValueForAdvancementRule,
  type CutRankingOptions,
} from "./cutRanking";

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
  /** Legacy en BD; el motor siempre aplica cupo exacto + desempate por perfil. */
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
  /** Plazas que pasan (p. ej. floor(70×50%) = 35). */
  cutSlots: number;
  /** Inscritos usados para calcular el cupo. */
  fieldSize: number;
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
  if (!catRule) return [...players];

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

function madeCutFromRanking(
  sorted: RankedCutPlayer[],
  rule: RoundAdvancementRule,
  fieldSize: number
): Set<string> {
  const eligible = sorted.filter((r) => r.primaryValue != null);
  if (eligible.length === 0 || fieldSize <= 0) return new Set();

  const cutSlots = cutSlotsFromRule(rule, fieldSize);
  return entryIdsMakingCut(eligible, cutSlots);
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
  tieBreakSteps: TieBreakStep[],
  informational?: boolean,
  fieldSize?: number,
  cutSlots?: number,
  closedClassification?: boolean
): string {
  const tieNote =
    tieBreakSteps.length > 0
      ? " · desempate en límite"
      : " · cupo exacto";
  const closedNote = closedClassification ? " · clasif. cerrada" : "";
  const prefix = informational ? "CORTE (referencia) · " : "CORTE · ";

  if (rule.advancement_type === "all") {
    return `${prefix}Pasan todos (→ R${rule.to_round_no})`;
  }

  const quotaNote =
    fieldSize != null && cutSlots != null && rule.advancement_type === "top_percent"
      ? ` · ${cutSlots} de ${fieldSize} inscritos`
      : "";

  if (rule.advancement_type === "top_percent") {
    return `${prefix}Top ${rule.advancement_value}% red. abajo (→ R${rule.to_round_no})${quotaNote}${closedNote}${tieNote}`;
  }

  return `${prefix}Top ${rule.advancement_value} (→ R${rule.to_round_no})${tieNote}`;
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
    informational?: boolean;
    fieldSize: number;
    leaderboardViewOverride?: LeaderboardViewOverride | null;
    cutRankingOptions?: CutRankingOptions;
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
      cutSlots: params.fieldSize,
      fieldSize: params.fieldSize,
      label: cutLabelForRule(
        rule,
        params.selectedRoundNo,
        [],
        params.informational
      ),
      madeCutEntryIds: new Set(scoped.map((r) => r.entry_id)),
    };
  }

  const catRule = competitionRuleForCategory(params.rulesMap, categoryId);
  if (!catRule) return null;
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
      params.strokeIndexByHole,
      params.leaderboardViewOverride,
      params.cutRankingOptions
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

  const cutSlots = cutSlotsFromRule(rule, params.fieldSize);

  let madeCut = madeCutFromRanking(sorted, rule, params.fieldSize);
  madeCut = applyGrossExemption(madeCut, sorted, rule);

  let afterPosition = 0;
  for (const row of sorted) {
    if (!madeCut.has(row.entryId)) break;
    afterPosition += 1;
  }
  if (afterPosition <= 0 && madeCut.size === 0) return null;
  if (afterPosition <= 0) {
    afterPosition = Math.min(cutSlots, madeCut.size);
  }

  return {
    categoryId,
    categoryCode: catCode,
    afterPosition,
    cutSlots,
    fieldSize: params.fieldSize,
    label: cutLabelForRule(
      rule,
      params.selectedRoundNo,
      tieBreakSteps,
      params.informational,
      params.fieldSize,
      cutSlots,
      params.cutRankingOptions?.useClosedRoundClassification
    ),
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
    cutSlots: Math.min(...catLines.map((l) => l.cutSlots)),
    fieldSize: primary.fieldSize,
    label: catLines.map((l) => l.label).join(" · "),
    madeCutEntryIds: merged ?? new Set(),
  };
}

/**
 * Corte real: elimina jugadores al generar salidas de `targetRoundNo` o al ver esa ronda.
 * Solo reglas con `to_round_no === targetRoundNo` (p. ej. `to_round_no: 3` → corte tras R2 para R3;
 * sin regla con `to_round_no: 2` → en R2 salen todos).
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

/** ¿Hay corte real al armar salidas de esta ronda? */
export function cutEnforcesAtTargetRound(
  advancementRules: RoundAdvancementRule[],
  targetRoundNo: number
): boolean {
  return getAdvancementRulesForTargetRound(advancementRules, targetRoundNo).length > 0;
}

/**
 * Línea de corte solo informativa (referencia): regla con destino futuro (`to_round_no` > ronda vista).
 * Ej. en R1 con regla → R3: muestra referencia tras R1 sin eliminar jugadores de R2.
 */
export function getInformationalAdvancementRulesForDisplay(
  advancementRules: RoundAdvancementRule[],
  selectedRoundNo: number
): RoundAdvancementRule[] {
  if (selectedRoundNo < 1) return [];
  return advancementRules
    .filter(
      (r) =>
        r.is_active &&
        r.to_round_no > selectedRoundNo &&
        r.from_round_no <= selectedRoundNo
    )
    .sort(
      (a, b) =>
        (a.sort_order ?? 999) - (b.sort_order ?? 999) ||
        a.from_round_no - b.from_round_no
    );
}

type ComputeCutLinesParams = {
  leaderboard: LeaderboardRow[];
  advancementRules: RoundAdvancementRule[];
  competitionRules: CategoryCompetitionRule[];
  categories: CategoryMeta[];
  selectedRoundNo: number;
  selectedCategoryId: string | null;
  handicapByPlayerId: Map<string, number | null>;
  tieBreakStepsByProfileId: Map<string, TieBreakStep[]>;
  strokeIndexByHole?: StrokeIndexByHole;
  informational?: boolean;
  /** Inscritos por categoría; si falta, se usa el tamaño del campo en tabla. */
  inscribedCountByCategoryId?: Map<string, number>;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
  lockedLookups?: LockedScorecardLookups;
  roundsForLock?: RoundIdMeta[];
  /** Clasificación oficial (solo tarjetas cerradas) para ordenar el corte. */
  useClosedRoundClassification?: boolean;
};

function computeCutLinesForRules(
  params: ComputeCutLinesParams,
  activeRules: RoundAdvancementRule[]
): PublicCutLine[] {
  if (activeRules.length === 0) return [];

  const rulesMap = rulesByCategoryId(params.competitionRules);
  const rawLines: PublicCutLine[] = [];

  const categoryScopeIds = categoryIdsForCutComputation(
    params.selectedCategoryId,
    params.inscribedCountByCategoryId,
    params.leaderboard
  );

  const cutRankingOptions: CutRankingOptions = {
    useClosedRoundClassification: params.useClosedRoundClassification,
    lockedLookups: params.lockedLookups,
    roundsForLock: params.roundsForLock,
  };

  const shared = {
    selectedRoundNo: params.selectedRoundNo,
    categories: params.categories,
    rulesMap,
    handicapByPlayerId: params.handicapByPlayerId,
    tieBreakStepsByProfileId: params.tieBreakStepsByProfileId,
    strokeIndexByHole: params.strokeIndexByHole,
    informational: params.informational,
    leaderboardViewOverride: params.leaderboardViewOverride,
    cutRankingOptions,
  };

  for (const categoryId of categoryScopeIds) {
    const rowsInCat = params.leaderboard.filter(
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
    const primaryRule = pickPrimaryAdvancementRule(
      activeRules,
      sampleRow,
      params.categories
    );
    if (!primaryRule) continue;

    const fieldSize = Math.max(
      params.inscribedCountByCategoryId?.get(categoryId) ?? 0,
      rowsInCat.length
    );

    const line = computeLineForRule(primaryRule, rowsInCat, categoryId, catCode, {
      ...shared,
      fieldSize,
    });
    if (line) rawLines.push(line);
  }

  return rawLines;
}

/** Cortes reales al entrar a `selectedRoundNo` (eliminan jugadores en salidas de esa ronda). */
export function computePublicCutLines(
  params: Omit<ComputeCutLinesParams, "informational">
): PublicCutLine[] {
  const enforcing = getAdvancementRulesForTargetRound(
    params.advancementRules,
    params.selectedRoundNo
  );
  return computeCutLinesForRules(
    { ...params, informational: false },
    enforcing
  );
}

/** Líneas de corte de referencia (no eliminan jugadores en la ronda actual). */
export function computeInformationalCutLines(
  params: Omit<ComputeCutLinesParams, "informational">
): PublicCutLine[] {
  const informational = getInformationalAdvancementRulesForDisplay(
    params.advancementRules,
    params.selectedRoundNo
  );
  return computeCutLinesForRules(
    { ...params, informational: true },
    informational
  );
}

/** Cortes para mostrar en clasificación: reales + referencia si aplica. */
export function computeDisplayCutLines(
  params: Omit<ComputeCutLinesParams, "informational">
): PublicCutLine[] {
  const enforcing = computePublicCutLines(params);
  if (enforcing.length > 0) return enforcing;
  return computeInformationalCutLines(params);
}

export function primaryCutLineForCategory(
  lines: PublicCutLine[],
  categoryId: string | null
): PublicCutLine | null {
  if (!categoryId) return null;
  return mergeCutLinesForCategory(lines, categoryId);
}

export { ruleAppliesToRow };
