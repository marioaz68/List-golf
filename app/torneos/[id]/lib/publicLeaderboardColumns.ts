import { collectRoundIdsWithScoreCapture } from "@/lib/leaderboard/roundCategoryMatch";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import { competitionRuleForCategory } from "@/lib/leaderboard/resolveCompetitionRule";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import type { LockedScorecardLookups, RoundIdMeta } from "@/lib/leaderboard/lockedScorecards";
import { formatPublicRoundColumnCell } from "@/lib/leaderboard/publicRoundScorePolicy";
import type { LeaderboardViewOverride } from "@/lib/leaderboard/leaderboardViewOverride";
import type { LeaderboardRow } from "./types";
import type { SelectedRoundMeta } from "./utils";

/** Columnas fijas antes de las de ronda: C, JUG, ★, POS, MV, THR. */
export const PUBLIC_LEADERBOARD_FIXED_COL_COUNT = 6;

const scoreColClass =
  "w-[32px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[34px]";

const scoreCellClass =
  "w-[32px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[34px]";

/** Rondas 1…N visibles según la ronda seleccionada en la UI. */
export function publicLeaderboardScoreColumnNos(
  selectedRound: SelectedRoundMeta | null | undefined
): number[] {
  const n = Math.max(1, selectedRound?.round_no ?? 1);
  return Array.from({ length: n }, (_, i) => i + 1);
}

export function publicLeaderboardScoreColumnHeader(
  roundNo: number,
  selectedRoundNo: number
): string {
  if (selectedRoundNo <= 1 && roundNo === 1) return "HOY";
  return `R${roundNo}`;
}

export function publicLeaderboardTableColSpan(
  selectedRound: SelectedRoundMeta | null | undefined
): number {
  const scoreCols = publicLeaderboardScoreColumnNos(selectedRound).length;
  return PUBLIC_LEADERBOARD_FIXED_COL_COUNT + scoreCols + 2;
}

export function publicLeaderboardTableMinWidthClassForScoreColumns(
  scoreColumnCount: number
): string {
  if (scoreColumnCount <= 1) return "min-w-[520px] md:min-w-[680px]";
  if (scoreColumnCount === 2) return "min-w-[554px] md:min-w-[716px]";
  return "min-w-[588px] md:min-w-[752px]";
}

export function roundDetailForPublicColumn(
  row: LeaderboardRow,
  roundNo: number,
  rulesMap: Map<string, CategoryCompetitionRule>,
  handicapByPlayerId: Map<string, number | null>,
  strokeIndexByHole: StrokeIndexByHole | undefined,
  viewOverride: LeaderboardViewOverride | null | undefined,
  options: {
    view: "live" | "official";
    selectedRound: SelectedRoundMeta | null | undefined;
    rounds: RoundIdMeta[];
    lockedLookups: LockedScorecardLookups;
  }
): string {
  const rule = competitionRuleForCategory(rulesMap, row.category_id);
  if (!rule) return "—";
  const scoreRoundIds = collectRoundIdsWithScoreCapture(row.details);
  const hcp = handicapByPlayerId.get(row.player_id) ?? null;
  const selectedRoundNo = options.selectedRound?.round_no ?? roundNo;

  return formatPublicRoundColumnCell({
    details: row.details,
    roundNo,
    entryId: row.entry_id,
    entryCategoryId: row.category_id,
    scoreRoundIds,
    rounds: options.rounds,
    lockedLookups: options.lockedLookups,
    view: options.view,
    selectedRoundNo,
    rule,
    handicapIndex: hcp,
    isDisqualified: row.is_disqualified,
    strokeIndexByHole,
    leaderboardViewOverride: viewOverride,
  });
}

export { scoreColClass, scoreCellClass };
