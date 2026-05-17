import {
  collectRoundIdsWithScoreCapture,
  resolveDetailForRoundNo,
  type SelectedRoundMeta,
} from "@/lib/leaderboard/roundCategoryMatch";
import type { LeaderboardRow, RoundDetail } from "./types";
import { formatRelativeOrDQ, formatScoreOrDQ } from "./utils";

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

export function formatPublicRoundColumnValue(
  detail: RoundDetail | null,
  isDisqualified: boolean
): string {
  if (isDisqualified) return "DQ";
  if (!detail) return "—";
  if (detail.is_dq) return "DQ";
  if (detail.to_par != null) {
    return formatRelativeOrDQ(detail.to_par, false);
  }
  if (detail.gross_score != null) {
    return formatScoreOrDQ(detail.gross_score, false);
  }
  return "—";
}

export function roundDetailForPublicColumn(
  row: Pick<LeaderboardRow, "details" | "category_id" | "is_disqualified">,
  roundNo: number
): string {
  const scoreRoundIds = collectRoundIdsWithScoreCapture(row.details);
  const detail = resolveDetailForRoundNo(
    row.details,
    roundNo,
    row.category_id,
    scoreRoundIds
  );
  return formatPublicRoundColumnValue(detail, row.is_disqualified);
}

export { scoreColClass, scoreCellClass };
