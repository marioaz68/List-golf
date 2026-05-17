/** Filas scorecards con tarjeta cerrada (locked_at). */
export type LockedScorecardRow = {
  entry_id: string;
  round_id: string;
  locked_at?: string | null;
};

export type RoundIdMeta = {
  id: string;
  round_no: number;
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

export function isEntryRoundClosed(
  entryId: string,
  round: { id: string; round_no: number },
  lookups: LockedScorecardLookups
): boolean {
  if (lookups.exact.has(`${entryId}_${round.id}`)) return true;
  return lookups.byEntryRoundNo.has(`${entryId}_${round.round_no}`);
}

export function entryHasAnyClosedRound(
  entryId: string,
  rounds: Array<{ id: string; round_no: number }>,
  lookups: LockedScorecardLookups
): boolean {
  return rounds.some((round) => isEntryRoundClosed(entryId, round, lookups));
}
