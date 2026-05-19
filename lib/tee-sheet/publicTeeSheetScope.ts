import {
  categoryRoundIdInSession,
  roundsInSameSession,
  type SessionRoundFields,
} from "@/app/(backoffice)/tee-sheet/sessionBlock";
import {
  isStartingOrderConfirmed,
  pairingGroupCategoryLabel,
  pairingGroupMatchesCategory,
} from "@/lib/tee-sheet/pairingGroupCategoryMatch";

export function competitiveDayKey(round: {
  round_no: number;
  round_date: string | null;
}) {
  return `${round.round_no}\u0000${String(round.round_date ?? "")}`;
}

export function sameCompetitiveDay(
  a: { round_no: number; round_date: string | null },
  b: { round_no: number; round_date: string | null }
) {
  return competitiveDayKey(a) === competitiveDayKey(b);
}

/** Días/jornadas con orden confirmado en al menos una fila `rounds` (todas las categorías del turno). */
export function publishedCompetitiveDayKeys(
  rounds: Array<{ id: string; round_no: number; round_date: string | null }>,
  notesByRoundId: ReadonlyMap<string, string | null | undefined>
): Set<string> {
  const keys = new Set<string>();
  for (const r of rounds) {
    if (!isStartingOrderConfirmed(notesByRoundId.get(r.id))) continue;
    for (const o of rounds) {
      if (sameCompetitiveDay(r, o)) keys.add(competitiveDayKey(o));
    }
  }
  return keys;
}

export function roundIdsForPublishedCompetitiveDays(
  sessionRounds: SessionRoundFields[],
  publishedKeys: Set<string>
): string[] {
  return sessionRounds
    .filter((r) => publishedKeys.has(competitiveDayKey(r)))
    .map((r) => r.id);
}

/** Ronda de la categoría para mostrar grupos (aunque el `round_id` del grupo sea de otra fila). */
export function categoryRoundIdForPairingDisplay(
  sessionRounds: SessionRoundFields[],
  groupRoundId: string,
  categoryId: string | null | undefined
): string {
  const cat = String(categoryId ?? "").trim();
  if (!cat) return groupRoundId;

  const fromSession = categoryRoundIdInSession(sessionRounds, groupRoundId, cat);
  const sessionRow = sessionRounds.find((r) => r.id === fromSession);
  if (String(sessionRow?.category_id ?? "").trim() === cat) return fromSession;

  const fromRound = sessionRounds.find((r) => r.id === groupRoundId);
  if (!fromRound) return groupRoundId;

  const sameDay = sessionRounds.find(
    (r) =>
      String(r.category_id ?? "").trim() === cat &&
      sameCompetitiveDay(r, fromRound)
  );
  return sameDay?.id ?? fromSession;
}

export function expandRoundIdsForPairingFetch(
  sessionRounds: SessionRoundFields[],
  seedRoundIds: string[]
): string[] {
  const ids = new Set<string>();
  for (const roundId of seedRoundIds) {
    ids.add(roundId);
    for (const sr of roundsInSameSession(sessionRounds, roundId)) {
      ids.add(sr.id);
    }
    const base = sessionRounds.find((r) => r.id === roundId);
    if (!base) continue;
    for (const r of sessionRounds) {
      if (sameCompetitiveDay(r, base)) ids.add(r.id);
    }
  }
  return [...ids];
}

export { pairingGroupCategoryLabel, pairingGroupMatchesCategory };
