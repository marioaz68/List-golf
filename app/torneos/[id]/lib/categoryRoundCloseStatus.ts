import {
  isEntryRoundClosedForCategory,
  type LockedScorecardLookups,
} from "@/lib/leaderboard/lockedScorecards";
import {
  getRoundForCategory,
  isCountableEntryStatus,
  type RoundForGate,
} from "@/lib/rounds/categoryRoundGate";
import { nameOfPlayer } from "./utils";
import type { RoundRow, ValidTournamentEntry } from "./types";

export type PendingRoundPlayer = {
  entryId: string;
  playerId: string;
  name: string;
  playerNumber: number | null;
  scoreEntryHref: string;
};

export type CategoryRoundCloseCard = {
  categoryCode: string;
  categoryId: string | null;
  closed: number;
  total: number;
  pending: number;
  pendingPlayers: PendingRoundPlayer[];
};

function buildScoreEntryHref(params: {
  tournamentId: string;
  roundId: string;
  playerNumber: number | null;
  name: string;
}) {
  const sp = new URLSearchParams();
  sp.set("tournament_id", params.tournamentId);
  if (params.playerNumber != null) {
    sp.set("q", String(params.playerNumber));
  } else if (params.name.trim()) {
    sp.set("q", params.name.trim());
  }
  return `/score-entry?${sp.toString()}`;
}

/** Estado de cierre por categoría para la ronda seleccionada (vista oficial). */
export function buildCategoryRoundCloseCards(
  entries: ValidTournamentEntry[],
  selectedRound: RoundRow | null,
  lockedLookups: LockedScorecardLookups,
  tournamentId: string,
  allRounds: RoundForGate[] = []
): CategoryRoundCloseCard[] {
  if (!selectedRound?.id || !Number.isFinite(selectedRound.round_no)) return [];
  const roundNo = selectedRound.round_no;

  const byCategory = new Map<
    string,
    {
      categoryId: string | null;
      closed: number;
      total: number;
      pendingPlayers: PendingRoundPlayer[];
    }
  >();

  for (const entry of entries) {
    if (!isCountableEntryStatus(entry.status)) continue;

    const categoryCode =
      entry.category?.code?.trim() ||
      entry.category?.name?.trim() ||
      "SIN CAT";

    if (!byCategory.has(categoryCode)) {
      byCategory.set(categoryCode, {
        categoryId: entry.category_id,
        closed: 0,
        total: 0,
        pendingPlayers: [],
      });
    }

    const bucket = byCategory.get(categoryCode)!;
    bucket.total += 1;

    const entryRound = getRoundForCategory(
      allRounds,
      roundNo,
      entry.category_id
    );

    const closed = isEntryRoundClosedForCategory(
      entry.id,
      entry.category_id,
      roundNo,
      allRounds,
      lockedLookups
    );

    if (closed) {
      bucket.closed += 1;
      continue;
    }

    const name = nameOfPlayer(entry.player);
    bucket.pendingPlayers.push({
      entryId: entry.id,
      playerId: entry.player_id,
      name,
      playerNumber: entry.player_number,
      scoreEntryHref: buildScoreEntryHref({
        tournamentId,
        roundId: entryRound?.id ?? selectedRound.id,
        playerNumber: entry.player_number,
        name,
      }),
    });
  }

  const cards: CategoryRoundCloseCard[] = [];

  for (const [categoryCode, bucket] of byCategory.entries()) {
    bucket.pendingPlayers.sort((a, b) => {
      const na = a.playerNumber ?? 99999;
      const nb = b.playerNumber ?? 99999;
      if (na !== nb) return na - nb;
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });

    cards.push({
      categoryCode,
      categoryId: bucket.categoryId,
      closed: bucket.closed,
      total: bucket.total,
      pending: Math.max(bucket.total - bucket.closed, 0),
      pendingPlayers: bucket.pendingPlayers,
    });
  }

  return cards.sort((a, b) =>
    a.categoryCode.localeCompare(b.categoryCode, "es", {
      sensitivity: "base",
    })
  );
}
