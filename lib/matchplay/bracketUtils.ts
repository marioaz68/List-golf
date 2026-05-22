/** Orden de siembra estándar para cuadro de eliminación (1 vs N, 8 vs 9, …). */
export function bracketSeedOrder(bracketSize: number): number[] {
  if (bracketSize < 2 || (bracketSize & (bracketSize - 1)) !== 0) {
    throw new Error("El tamaño del cuadro debe ser potencia de 2 (4, 8, 16, 32, 64).");
  }
  if (bracketSize === 2) return [1, 2];

  const half = bracketSize / 2;
  const prev = bracketSeedOrder(half);
  const out: number[] = [];
  for (const s of prev) {
    out.push(s);
    out.push(bracketSize + 1 - s);
  }
  return out;
}

/** Siguiente potencia de 2 (mín 2, máx 64). */
export function bracketCapacity(teamCount: number, maxCap = 64): number {
  const n = Math.max(2, Math.min(maxCap, teamCount));
  let size = 2;
  while (size < n) size *= 2;
  return size;
}

export function roundCountForBracketSize(bracketSize: number): number {
  return Math.log2(bracketSize);
}

/** Parejas de seeds para ronda 1: [[1,16],[8,9],...] */
/** Etiquetas de ronda según tamaño del cuadro (estilo CCQ). */
export function roundLabel(
  roundNo: number,
  roundCount: number,
  bracketSize: number
): string {
  const slotsInRound = bracketSize / Math.pow(2, roundNo);
  if (roundNo === roundCount) return "Final";
  if (slotsInRound === 2) return "Semifinal";
  if (slotsInRound === 4) return "Cuartos";
  if (slotsInRound === 8) return "Octavos";
  if (slotsInRound === 16) return "Dieciseisavos";
  return `Ronda ${roundNo}`;
}

export function firstRoundSeedPairs(bracketSize: number): Array<[number, number]> {
  const order = bracketSeedOrder(bracketSize);
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < order.length; i += 2) {
    pairs.push([order[i], order[i + 1]]);
  }
  return pairs;
}
