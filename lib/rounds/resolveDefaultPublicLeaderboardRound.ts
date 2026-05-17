import {
  getRoundForCategory,
  isCategoryRoundFullyClosed,
  type RoundForGate,
  type TournamentEntryForGate,
} from "@/lib/rounds/categoryRoundGate";
import type { LockedScorecardLookups } from "@/lib/leaderboard/lockedScorecards";

type RoundPick = { id: string; round_no: number; category_id?: string | null };

/**
 * Ronda por defecto en clasificación pública: la primera ronda lógica que aún
 * no está cerrada en la categoría (o en todas si no hay filtro). Si R1 ya cerró
 * en Seniors, muestra R2 aunque aún no haya scores de R2.
 */
export function resolveDefaultPublicLeaderboardRound<R extends RoundPick>(params: {
  entries: TournamentEntryForGate[];
  allRounds: RoundForGate[];
  roundsInScope: R[];
  selectedCategoryId: string | null;
  lockedLookups: LockedScorecardLookups;
  latestRoundWithScores: R | null;
}): R | null {
  const roundNos = [...new Set(params.roundsInScope.map((r) => r.round_no))]
    .filter((n) => Number.isFinite(n) && n >= 1)
    .sort((a, b) => a - b);

  if (roundNos.length === 0) {
    return params.latestRoundWithScores ?? params.roundsInScope[0] ?? null;
  }

  const categoryIds = params.selectedCategoryId
    ? [params.selectedCategoryId]
    : [
        ...new Set(
          params.entries
            .map((e) => String(e.category_id ?? "").trim())
            .filter(Boolean)
        ),
      ];

  if (categoryIds.length === 0) {
    return params.latestRoundWithScores ?? params.roundsInScope[0] ?? null;
  }

  let displayRoundNo = roundNos[0]!;

  for (const roundNo of roundNos) {
    displayRoundNo = roundNo;
    const stillOpen = categoryIds.some(
      (categoryId) =>
        !isCategoryRoundFullyClosed(
          params.entries,
          params.allRounds,
          roundNo,
          categoryId,
          params.lockedLookups
        )
    );
    if (stillOpen) break;
  }

  if (params.selectedCategoryId) {
    const row = getRoundForCategory(
      params.allRounds,
      displayRoundNo,
      params.selectedCategoryId
    );
    if (row) {
      return (
        params.roundsInScope.find((r) => r.id === row.id) ??
        (row as R)
      );
    }
    return params.latestRoundWithScores ?? params.roundsInScope[0] ?? null;
  }

  const candidates = params.roundsInScope.filter(
    (r) => r.round_no === displayRoundNo
  );
  if (params.latestRoundWithScores?.round_no === displayRoundNo) {
    const match = candidates.find(
      (r) => r.id === params.latestRoundWithScores!.id
    );
    if (match) return match;
  }

  return (
    candidates.sort((a, b) => a.id.localeCompare(b.id))[0] ??
    params.latestRoundWithScores ??
    params.roundsInScope[0] ??
    null
  );
}

/** Misma ronda lógica (R1, R2…) en otra categoría. */
export function resolvePublicRoundIdForCategory(
  rounds: RoundPick[],
  roundNo: number,
  categoryId: string | null
): string | null {
  if (!Number.isFinite(roundNo) || roundNo < 1) return null;

  if (categoryId) {
    return getRoundForCategory(rounds, roundNo, categoryId)?.id ?? null;
  }

  const candidates = rounds.filter((r) => r.round_no === roundNo);
  return candidates.sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? null;
}
