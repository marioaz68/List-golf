import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import type { SelectedRoundMeta } from "@/app/torneos/[id]/lib/utils";
import {
  collectRoundIdsWithScoreCapture,
  resolveEffectiveRoundIdForEntry,
  resolvePreviousRoundRowForEntry,
  roundRowAppliesToEntry,
} from "./roundCategoryMatch";
import {
  isStablefordCategory,
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";
import { competitionRuleForCategory } from "./resolveCompetitionRule";
import {
  cumulativeLeaderboardValue,
  type StrokeIndexByHole,
} from "./competitionScoring";

function compareSortValues(
  a: number | null,
  b: number | null,
  higherIsBetterSort: boolean
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return higherIsBetterSort ? b - a : a - b;
}

/**
 * Recalcula posiciones por categoría y ronda según reglas de competencia (neto / Stableford).
 */
export function applyCompetitionStandings({
  leaderboard,
  rounds,
  selectedRound,
  competitionRules,
  handicapByPlayerId,
  strokeIndexByHole,
}: {
  leaderboard: LeaderboardRow[];
  rounds: SelectedRoundMeta[];
  selectedRound: SelectedRoundMeta | null;
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  strokeIndexByHole?: StrokeIndexByHole;
}): LeaderboardRow[] {
  const rulesMap = rulesByCategoryId(competitionRules);
  const sortedRounds = [...rounds].sort((a, b) => a.round_no - b.round_no);

  const standingsByRoundCategory = new Map<
    string,
    Map<string, Map<string, { pos: number | null; sortValue: number | null }>>
  >();

  for (const round of sortedRounds) {
    const roundsUpTo = sortedRounds.filter((r) => r.round_no <= round.round_no);
    const roundIdsUpTo = new Set(roundsUpTo.map((r) => r.id));
    const categoryBuckets = new Map<string, LeaderboardRow[]>();

    for (const row of leaderboard) {
      const key = row.category_id ?? "__no_category__";
      const bucket = categoryBuckets.get(key) ?? [];
      bucket.push(row);
      categoryBuckets.set(key, bucket);
    }

    const roundCategoryMap = new Map<
      string,
      Map<string, { pos: number | null; sortValue: number | null }>
    >();

    for (const [categoryKey, rowsInCategory] of categoryBuckets) {
      const rule = competitionRuleForCategory(
        rulesMap,
        rowsInCategory[0]?.category_id ?? null
      );
      const hiBetter = isStablefordCategory(rule);

      const scored = rowsInCategory.map((row) => {
        if (row.is_disqualified) {
          return { row, sortValue: null as number | null };
        }

        const hcp = handicapByPlayerId.get(row.player_id) ?? null;
        const detailsInScope = row.details.filter((d) => {
          if (!roundIdsUpTo.has(d.round_id)) return false;
          return roundRowAppliesToEntry(
            { category_id: d.category_id ?? null },
            row.category_id
          );
        });

        const cum = cumulativeLeaderboardValue(
          detailsInScope,
          rule,
          hcp,
          round.round_no,
          strokeIndexByHole
        );
        return { row, sortValue: cum.sortValue };
      });

      scored.sort((a, b) => {
        if (a.row.is_disqualified && !b.row.is_disqualified) return 1;
        if (!a.row.is_disqualified && b.row.is_disqualified) return -1;
        const cmp = compareSortValues(a.sortValue, b.sortValue, hiBetter);
        if (cmp !== 0) return cmp;
        return String(a.row.player_name ?? "").localeCompare(
          String(b.row.player_name ?? ""),
          "es"
        );
      });

      const playerMap = new Map<
        string,
        { pos: number | null; sortValue: number | null }
      >();
      let pos = 0;
      let prevKey = "";

      scored.forEach((item, idx) => {
        if (item.row.is_disqualified) {
          playerMap.set(item.row.player_id, { pos: null, sortValue: null });
          return;
        }
        const key = String(item.sortValue ?? "x");
        if (idx === 0 || key !== prevKey) {
          pos = idx + 1;
          prevKey = key;
        }
        playerMap.set(item.row.player_id, {
          pos,
          sortValue: item.sortValue,
        });
      });

      roundCategoryMap.set(categoryKey, playerMap);
    }

    standingsByRoundCategory.set(round.id, roundCategoryMap);
  }

  return leaderboard.map((row) => {
    const categoryKey = row.category_id ?? "__no_category__";
    const captureRoundIds = collectRoundIdsWithScoreCapture(row.details);

    const standingByRoundCategory = sortedRounds.map((round) => {
      const snap = standingsByRoundCategory
        .get(round.id)
        ?.get(categoryKey)
        ?.get(row.player_id);

      const prev = row.standing_by_round_category.find(
        (s) => s.round_id === round.id
      );

      return {
        round_id: round.id,
        round_no: round.round_no,
        pos: snap?.pos ?? null,
        to_par: prev?.to_par ?? null,
        gross: prev?.gross ?? null,
        played_rounds: prev?.played_rounds ?? 0,
      };
    });

    const effectiveRoundId = resolveEffectiveRoundIdForEntry(
      selectedRound,
      row.category_id,
      sortedRounds,
      captureRoundIds
    );

    const selectedStandingCategory =
      standingByRoundCategory.find((s) => s.round_id === effectiveRoundId) ??
      null;

    const effectiveRound =
      sortedRounds.find((r) => r.id === effectiveRoundId) ?? selectedRound;

    const prevRoundRow = resolvePreviousRoundRowForEntry(
      effectiveRound ?? null,
      row.category_id,
      sortedRounds,
      captureRoundIds
    );

    const previousStandingCategory =
      prevRoundRow != null
        ? standingByRoundCategory.find((s) => s.round_id === prevRoundRow.id) ??
          null
        : null;

    const moveVsPreviousCategory =
      selectedStandingCategory?.pos != null &&
      previousStandingCategory?.pos != null
        ? previousStandingCategory.pos - selectedStandingCategory.pos
        : null;

    return {
      ...row,
      standing_by_round_category: standingByRoundCategory,
      selected_round_position_category: row.is_disqualified
        ? null
        : selectedStandingCategory?.pos ?? row.selected_round_position_category,
      move_vs_previous_category: row.is_disqualified
        ? null
        : moveVsPreviousCategory,
    };
  });
}
