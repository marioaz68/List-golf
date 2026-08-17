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

/**
 * Tamaño de cuadro al cerrar el campo: 8, 16, 32 o 64.
 * 36 parejas → 64; 32 o menos → 32; 16 o menos → 16; menos de 8 → 8.
 */
export function fieldBracketSize(unitCount: number, maxCap = 64): number {
  const n = Math.max(1, Math.floor(unitCount));
  const size = bracketCapacity(n, maxCap);
  return Math.max(8, size);
}

export function isCountableMatchPlayEntryStatus(
  status: string | null | undefined
): boolean {
  const s = String(status ?? "").toLowerCase();
  return s !== "withdrawn" && s !== "cancelled" && s !== "wd";
}

/**
 * Unidades del campo: individual = inscritos; parejas = equipos o floor(inscritos/2).
 * Se toma el mayor para no subestimar si aún faltan equipos por armar.
 */
export function countMatchPlayFieldUnits(input: {
  matchType?: string | null;
  activeTeamCount: number;
  activeEntryCount: number;
}): number {
  const fromEntries =
    input.matchType === "individual"
      ? input.activeEntryCount
      : Math.floor(input.activeEntryCount / 2);
  return Math.max(input.activeTeamCount, fromEntries);
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
