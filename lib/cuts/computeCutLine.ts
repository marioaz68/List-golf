import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  cumulativeLeaderboardValue,
  scoreRoundDetail,
} from "@/lib/leaderboard/competitionScoring";
import {
  defaultRuleForCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";

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
      const cat = categories.find((c) => c.id === id);
      const catCode = (cat?.code ?? code).toUpperCase();
      return catCode.startsWith(group);
    }
    case "overall":
      return true;
    default:
      return false;
  }
}

function rankValueForCut(
  row: LeaderboardRow,
  rule: RoundAdvancementRule,
  throughRoundNo: number,
  rulesMap: Map<string, CategoryCompetitionRule>,
  handicapByPlayerId: Map<string, number | null>
): number | null {
  const catRule =
    rulesMap.get(String(row.category_id ?? "")) ??
    defaultRuleForCategory(row.category_id);

  const hcp = handicapByPlayerId.get(row.player_id) ?? null;

  if (rule.ranking_basis === "points_total" || rule.ranking_basis === "points_round") {
    const details =
      rule.ranking_basis === "points_round"
        ? row.details.filter((d) => d.round_no === throughRoundNo)
        : row.details.filter((d) => d.round_no <= throughRoundNo);
    let pts = 0;
    let has = false;
    for (const d of details) {
      const s = scoreRoundDetail(d, catRule, hcp);
      if (s.stablefordPoints != null) {
        pts += s.stablefordPoints;
        has = true;
      }
    }
    return has ? pts : null;
  }

  if (
    rule.ranking_basis === "gross_round" ||
    rule.ranking_basis === "net_round"
  ) {
    const detail = row.details.find((d) => d.round_no === throughRoundNo);
    if (!detail) return null;
    const s = scoreRoundDetail(detail, catRule, hcp);
    if (rule.ranking_basis === "net_round") return s.netToPar;
    return s.toPar ?? s.gross;
  }

  const cum = cumulativeLeaderboardValue(
    row.details,
    catRule,
    hcp,
    throughRoundNo
  );

  if (rule.ranking_basis === "net_total") {
    return cum.displayToPar;
  }

  return cum.sortValue;
}

function sortForCut(a: number | null, b: number | null, higherIsBetter: boolean) {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  if (higherIsBetter) return b - a;
  return a - b;
}

function madeCutEntryIds(
  ranked: Array<{ entryId: string; value: number | null }>,
  topN: number,
  higherIsBetter: boolean
): Set<string> {
  const eligible = ranked.filter((r) => r.value != null);
  if (eligible.length === 0) return new Set();

  const limit = Math.min(topN, eligible.length);
  const cutValue = eligible[limit - 1]!.value!;

  const ids = new Set<string>();
  for (const row of ranked) {
    if (row.value == null) continue;
    const makes = higherIsBetter
      ? row.value >= cutValue
      : row.value <= cutValue;
    if (makes) ids.add(row.entryId);
  }
  return ids;
}

function topNFromRule(
  rule: RoundAdvancementRule,
  fieldSize: number
): number {
  if (rule.advancement_type === "top_percent") {
    const pct = Math.max(0, Math.min(100, Number(rule.advancement_value)));
    return Math.max(1, Math.ceil((fieldSize * pct) / 100));
  }
  return Math.max(1, Math.trunc(Number(rule.advancement_value)));
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
}): PublicCutLine[] {
  const { leaderboard, selectedRoundNo } = params;
  if (selectedRoundNo <= 1) return [];

  const activeRules = params.advancementRules.filter(
    (r) =>
      r.is_active &&
      r.to_round_no === selectedRoundNo &&
      r.from_round_no < selectedRoundNo &&
      r.advancement_type !== "all"
  );

  if (activeRules.length === 0) return [];

  const rulesMap = rulesByCategoryId(params.competitionRules);
  const lines: PublicCutLine[] = [];

  const categoryScopeIds = params.selectedCategoryId
    ? [params.selectedCategoryId]
    : [
        ...new Set(
          leaderboard
            .map((r) => String(r.category_id ?? "").trim())
            .filter(Boolean)
        ),
      ];

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

    for (const rule of activeRules) {
      const scoped = rowsInCat.filter((r) => ruleAppliesToRow(rule, r, params.categories));
      if (scoped.length === 0) continue;

      const throughRoundNo = rule.from_round_no;
      const higherIsBetter =
        rule.ranking_basis === "points_total" ||
        rule.ranking_basis === "points_round";

      const ranked = scoped
        .map((row) => ({
          entryId: row.entry_id,
          value: rankValueForCut(
            row,
            rule,
            throughRoundNo,
            rulesMap,
            params.handicapByPlayerId
          ),
        }))
        .sort((a, b) => sortForCut(a.value, b.value, higherIsBetter));

      const topN = topNFromRule(rule, ranked.filter((r) => r.value != null).length);
      const madeCut = madeCutEntryIds(ranked, topN, higherIsBetter);

      let afterPosition = 0;
      for (const row of ranked) {
        if (!madeCut.has(row.entryId)) break;
        afterPosition += 1;
      }
      if (afterPosition <= 0) continue;

      const label =
        rule.advancement_type === "top_percent"
          ? `CORTE · Top ${rule.advancement_value}% (R${throughRoundNo})`
          : `CORTE · Top ${rule.advancement_value} (R${throughRoundNo})`;

      lines.push({
        categoryId,
        categoryCode: catCode,
        afterPosition,
        label,
        madeCutEntryIds: madeCut,
      });
    }
  }

  return lines;
}

export function primaryCutLineForCategory(
  lines: PublicCutLine[],
  categoryId: string | null
): PublicCutLine | null {
  if (lines.length === 0) return null;
  if (categoryId) {
    return lines.find((l) => l.categoryId === categoryId) ?? null;
  }
  return lines[0] ?? null;
}
