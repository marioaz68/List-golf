import {
  isEntryRoundClosed,
  type LockedScorecardLookups,
} from "@/lib/leaderboard/lockedScorecards";
import { isTournamentRoundOfficiallyClosed } from "@/lib/rounds/tournamentRoundClosure";

export type TournamentEntryForGate = {
  id: string;
  category_id: string | null;
  status?: string | null;
};

export type RoundForGate = {
  id: string;
  round_no: number;
  category_id?: string | null;
};

export function isCountableEntryStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").toLowerCase();
  return s === "confirmed" || s === "active";
}

/** Ronda del torneo para una categoría y número de ronda lógico. */
export function getRoundForCategory(
  rounds: RoundForGate[],
  roundNo: number,
  categoryId: string | null
): RoundForGate | null {
  const matching = rounds.filter((r) => r.round_no === roundNo);
  if (matching.length === 0) return null;

  const cat = String(categoryId ?? "").trim();
  if (cat) {
    const byCat = matching.find((r) => String(r.category_id ?? "").trim() === cat);
    if (byCat) return byCat;

    const shared = matching.filter((r) => !String(r.category_id ?? "").trim());
    if (shared.length === 1) return shared[0];
  }

  return matching[0] ?? null;
}

/** Todas las inscripciones activas/confirmadas de la categoría tienen la ronda cerrada (locked). */
export function isCategoryRoundFullyClosed(
  entries: TournamentEntryForGate[],
  rounds: RoundForGate[],
  roundNo: number,
  categoryId: string | null,
  lookups: LockedScorecardLookups
): boolean {
  const round = getRoundForCategory(rounds, roundNo, categoryId);
  if (!round) return true;

  const cat = String(categoryId ?? "").trim();
  const inCategory = entries.filter((e) => {
    if (!isCountableEntryStatus(e.status)) return false;
    const ec = String(e.category_id ?? "").trim();
    if (!cat) return !ec;
    return ec === cat;
  });

  if (inCategory.length === 0) return true;

  return inCategory.every((entry) =>
    isEntryRoundClosed(entry.id, round, lookups)
  );
}

export type PriorRoundGateResult = {
  blocked: true;
  priorRoundNo: number;
  categoryId: string | null;
  needsOfficialClose?: boolean;
};

/** Si la ronda objetivo es ≥2, exige que la ronda anterior esté cerrada en esa categoría. */
export function getPriorRoundGate(
  entries: TournamentEntryForGate[],
  rounds: RoundForGate[],
  targetRoundNo: number,
  categoryId: string | null,
  lookups: LockedScorecardLookups,
  tournamentSettings?: unknown
): PriorRoundGateResult | null {
  if (targetRoundNo <= 1) return null;

  const priorRoundNo = targetRoundNo - 1;
  const closed = isCategoryRoundFullyClosed(
    entries,
    rounds,
    priorRoundNo,
    categoryId,
    lookups
  );

  if (!closed) {
    return {
      blocked: true,
      priorRoundNo,
      categoryId,
    };
  }

  if (!isTournamentRoundOfficiallyClosed(tournamentSettings, priorRoundNo)) {
    return {
      blocked: true,
      priorRoundNo,
      categoryId,
      needsOfficialClose: true,
    };
  }

  return null;
}

/** Categorías del bloque que aún no pueden usar `targetRoundNo` (R1 no cerrada, etc.). */
export function listCategoriesBlockedForRound(
  entries: TournamentEntryForGate[],
  rounds: RoundForGate[],
  targetRoundNo: number,
  categoryIds: string[],
  lookups: LockedScorecardLookups,
  tournamentSettings?: unknown
): string[] {
  if (targetRoundNo <= 1) return [];

  const blocked: string[] = [];
  for (const categoryId of categoryIds) {
    const gate = getPriorRoundGate(
      entries,
      rounds,
      targetRoundNo,
      categoryId,
      lookups,
      tournamentSettings
    );
    if (gate) blocked.push(categoryId);
  }
  return blocked;
}
