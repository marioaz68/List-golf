import {
  collectRoundIdsWithScoreCapture,
  resolvePreviousRoundRowForEntry,
  roundRowAppliesToEntry,
  type RoundLike,
} from "@/lib/leaderboard/roundCategoryMatch";
import type {
  LeaderboardRow,
  RoundStandingSnapshot,
} from "@/app/torneos/[id]/lib/types";
import type { SelectedRoundMeta } from "@/app/torneos/[id]/lib/utils";

/** Ronda que el jugador lleva en juego (última con captura en su categoría). */
export function resolveFavoritePlayerDisplayRound(
  row: LeaderboardRow,
  rounds: RoundLike[]
): SelectedRoundMeta | null {
  const captureIds = collectRoundIdsWithScoreCapture(row.details);
  const applicable = rounds.filter((r) =>
    roundRowAppliesToEntry({ category_id: r.category_id ?? null }, row.category_id)
  );

  let best: RoundLike | null = null;
  for (const round of applicable) {
    if (!captureIds.has(round.id)) continue;
    const detail = row.details.find((d) => d.round_id === round.id);
    const holeCount =
      detail?.holes.filter((h) => h.strokes != null).length ?? 0;
    if (
      holeCount <= 0 &&
      detail?.gross_score == null &&
      !detail?.is_dq
    ) {
      continue;
    }
    if (!best || round.round_no > best.round_no) {
      best = round;
    }
  }

  if (best) return best;

  const sorted = [...applicable].sort((a, b) => a.round_no - b.round_no);
  return sorted[0] ?? null;
}

export function favoritePlayerStanding(
  row: LeaderboardRow,
  roundId: string | null | undefined
): RoundStandingSnapshot | null {
  if (!roundId) return null;
  return (
    row.standing_by_round_category.find((s) => s.round_id === roundId) ??
    row.standing_by_round.find((s) => s.round_id === roundId) ??
    null
  );
}

export function favoritePlayerPreviousStanding(
  row: LeaderboardRow,
  playerRound: SelectedRoundMeta | null,
  rounds: RoundLike[]
): RoundStandingSnapshot | null {
  if (!playerRound || playerRound.round_no <= 1) return null;
  const captureIds = collectRoundIdsWithScoreCapture(row.details);
  const prev = resolvePreviousRoundRowForEntry(
    playerRound,
    row.category_id,
    rounds,
    captureIds
  );
  if (!prev) return null;
  return favoritePlayerStanding(row, prev.id);
}

export function favoritePlayerMove(
  row: LeaderboardRow,
  playerRound: SelectedRoundMeta | null,
  rounds: RoundLike[]
): number | null {
  if (row.is_disqualified) return null;
  const current = favoritePlayerStanding(row, playerRound?.id ?? null);
  const previous = favoritePlayerPreviousStanding(row, playerRound, rounds);
  if (current?.pos == null || previous?.pos == null) return null;
  return previous.pos - current.pos;
}

export function maxFavoriteDisplayRoundNo(
  rows: LeaderboardRow[],
  rounds: RoundLike[]
): number {
  let max = 1;
  for (const row of rows) {
    const playerRound = resolveFavoritePlayerDisplayRound(row, rounds);
    if (playerRound && playerRound.round_no > max) {
      max = playerRound.round_no;
    }
  }
  return max;
}

export function favoriteHeaderRoundMeta(
  maxRoundNo: number
): SelectedRoundMeta {
  return {
    id: "",
    round_no: maxRoundNo,
    round_date: null,
    category_id: null,
    wave: null,
  };
}
