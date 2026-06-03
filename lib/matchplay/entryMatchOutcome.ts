import type { DerivedMatchDecision } from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import type { DerivedMatchRow } from "@/lib/matchplay/derivePairingGroupMatches";

export type MatchEntrySide = "top" | "bottom" | null;

/** Determina en qué pareja del match está un inscrito (top = posiciones 1-2). */
export function getEntrySideInDerivedMatch(
  entryId: string,
  match: Pick<
    DerivedMatchRow,
    | "top_a_entry_id"
    | "top_b_entry_id"
    | "bottom_a_entry_id"
    | "bottom_b_entry_id"
  >
): MatchEntrySide {
  const eid = entryId.trim();
  if (!eid) return null;
  const topIds = [match.top_a_entry_id, match.top_b_entry_id].filter(Boolean);
  const bottomIds = [match.bottom_a_entry_id, match.bottom_b_entry_id].filter(
    Boolean
  );
  if (topIds.includes(eid)) return "top";
  if (bottomIds.includes(eid)) return "bottom";
  return null;
}

/** True si el inscrito pertenece a la pareja perdedora de un match ya decidido. */
export function isEntryEliminatedInMatch(
  entryId: string,
  match: Pick<
    DerivedMatchRow,
    | "top_a_entry_id"
    | "top_b_entry_id"
    | "bottom_a_entry_id"
    | "bottom_b_entry_id"
  >,
  decision: Pick<DerivedMatchDecision, "winner"> | null | undefined
): boolean {
  if (!decision?.winner) return false;
  const side = getEntrySideInDerivedMatch(entryId, match);
  if (!side) return false;
  return side !== decision.winner;
}

/** entry_ids de la pareja perdedora (0-2 jugadores). */
export function losingPairEntryIds(
  match: Pick<
    DerivedMatchRow,
    | "top_a_entry_id"
    | "top_b_entry_id"
    | "bottom_a_entry_id"
    | "bottom_b_entry_id"
  >,
  decision: Pick<DerivedMatchDecision, "winner">
): string[] {
  const loserSide = decision.winner === "top" ? "bottom" : "top";
  if (loserSide === "top") {
    return [match.top_a_entry_id, match.top_b_entry_id].filter((id): id is string =>
      Boolean(id)
    );
  }
  return [match.bottom_a_entry_id, match.bottom_b_entry_id].filter(
    (id): id is string => Boolean(id)
  );
}
