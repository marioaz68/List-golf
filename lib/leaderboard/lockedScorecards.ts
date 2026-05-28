import { getRoundForCategory } from "@/lib/rounds/categoryRoundGate";

/** Filas scorecards con tarjeta cerrada (locked_at). */
export type LockedScorecardRow = {
  entry_id: string;
  round_id: string;
  locked_at?: string | null;
};

export type RoundIdMeta = {
  id: string;
  round_no: number;
  category_id?: string | null;
};

export type LockedScorecardLookups = {
  /** `${entry_id}_${round_id}` */
  exact: Set<string>;
  /** `${entry_id}_${round_no}` — misma ronda lógica, distinto id por categoría */
  byEntryRoundNo: Set<string>;
};

export function buildLockedScorecardLookups(
  scorecards: LockedScorecardRow[],
  rounds: RoundIdMeta[]
): LockedScorecardLookups {
  const roundNoById = new Map<string, number>();
  for (const r of rounds) {
    roundNoById.set(r.id, r.round_no);
  }

  const exact = new Set<string>();
  const byEntryRoundNo = new Set<string>();

  for (const sc of scorecards) {
    if (!sc.entry_id || !sc.round_id || !sc.locked_at) continue;
    exact.add(`${sc.entry_id}_${sc.round_id}`);
    const roundNo = roundNoById.get(sc.round_id);
    if (roundNo != null) {
      byEntryRoundNo.add(`${sc.entry_id}_${roundNo}`);
    }
  }

  return { exact, byEntryRoundNo };
}

/**
 * Cierre solo en la fila `rounds` de la categoría del inscrito (por `round_id`).
 * No usar `round_no` a secas: en torneos multi-categoría había falsos «cerrado».
 */
export function isEntryRoundClosed(
  entryId: string,
  round: { id: string; round_no: number },
  lookups: LockedScorecardLookups
): boolean {
  return lookups.exact.has(`${entryId}_${round.id}`);
}

/** Cierre para un inscrito usando la fila `rounds` de SU categoría (multi-categoría). */
export function isEntryRoundClosedForCategory(
  entryId: string,
  entryCategoryId: string | null,
  roundNo: number,
  rounds: Array<{ id: string; round_no: number; category_id?: string | null }>,
  lookups: LockedScorecardLookups
): boolean {
  const round = getRoundForCategory(rounds, roundNo, entryCategoryId);
  if (!round?.id) return false;
  return isEntryRoundClosed(entryId, round, lookups);
}

export function entryHasAnyClosedRound(
  entryId: string,
  rounds: Array<{ id: string; round_no: number }>,
  lookups: LockedScorecardLookups
): boolean {
  return rounds.some((round) => isEntryRoundClosed(entryId, round, lookups));
}
