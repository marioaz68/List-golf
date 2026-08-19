/**
 * Testigo en torneo de parejas:
 *  - Nadie atestigua a su compañero.
 *  - El testigo es siempre alguien de la pareja rival.
 *  - Basta un jugador de cada pareja para firmar (la firma cubre al compañero
 *    y, al firmar, atestigua a la pareja contraria).
 */

export type PairSides = {
  a: string[];
  b: string[];
};

export type PairWitnessAssignment = {
  entryId: string;
  witnessEntryId: string;
};

export function sideOf(
  entryId: string,
  sides: PairSides | null | undefined
): "a" | "b" | null {
  const id = entryId.trim();
  if (!id || !sides) return null;
  if (sides.a.includes(id)) return "a";
  if (sides.b.includes(id)) return "b";
  return null;
}

export function pairMatesOf(
  entryId: string,
  sides: PairSides | null | undefined
): string[] {
  const side = sideOf(entryId, sides);
  if (!side || !sides) return entryId.trim() ? [entryId.trim()] : [];
  return side === "a" ? [...sides.a] : [...sides.b];
}

export function partnerOf(
  entryId: string,
  sides: PairSides | null | undefined
): string | null {
  const id = entryId.trim();
  if (!id) return null;
  return pairMatesOf(id, sides).find((eid) => eid !== id) ?? null;
}

export function opposingOf(
  entryId: string,
  sides: PairSides | null | undefined
): string[] {
  const side = sideOf(entryId, sides);
  if (!side || !sides) return [];
  return side === "a" ? [...sides.b] : [...sides.a];
}

export function isOpposingWitness(
  witnessEntryId: string,
  targetEntryId: string,
  sides: PairSides | null | undefined
): boolean {
  const me = witnessEntryId.trim();
  const target = targetEntryId.trim();
  if (!me || !target || me === target) return false;
  const meSide = sideOf(me, sides);
  const targetSide = sideOf(target, sides);
  return meSide != null && targetSide != null && meSide !== targetSide;
}

export function samePair(
  a: string,
  b: string,
  sides: PairSides | null | undefined
): boolean {
  const sideA = sideOf(a, sides);
  const sideB = sideOf(b, sides);
  return sideA != null && sideA === sideB;
}

export function assignmentsAreOpposing(
  assignments: PairWitnessAssignment[],
  sides: PairSides
): boolean {
  if (assignments.length === 0) return false;
  return assignments.every((row) =>
    isOpposingWitness(row.witnessEntryId, row.entryId, sides)
  );
}

/** Cada jugador queda asignado a un testigo de la pareja rival (nunca al compañero). */
export function buildOpposingWitnessAssignments(
  entryIds: string[],
  sides: PairSides
): PairWitnessAssignment[] {
  const out: PairWitnessAssignment[] = [];
  for (const eid of entryIds) {
    const opp = opposingOf(eid, sides);
    if (opp.length === 0) continue;
    const mates = pairMatesOf(eid, sides);
    const idx = Math.max(0, mates.indexOf(eid));
    out.push({
      entryId: eid,
      witnessEntryId: opp[idx % opp.length]!,
    });
  }
  return out;
}

const UNIQUE_SIDES = 2;
const PLAYERS_PER_SIDE = 2;

export function isCompletePairSides(
  sides: PairSides | null | undefined
): sides is PairSides {
  if (!sides) return false;
  const a = [...new Set(sides.a.filter(Boolean))];
  const b = [...new Set(sides.b.filter(Boolean))];
  if (a.length !== PLAYERS_PER_SIDE || b.length !== PLAYERS_PER_SIDE) {
    return false;
  }
  const all = [...a, ...b];
  return new Set(all).size === UNIQUE_SIDES * PLAYERS_PER_SIDE;
}
