import {
  CLOSEST_TO_PIN_MAX_PRIZES,
  type ClosestToPinStanding,
} from "./types";

type RankInput = {
  entryId: string;
  playerName: string;
  categoryCode: string | null;
  distanceCm: number;
  groupNo: number | null;
  capturistSigned?: boolean;
  capturistSignerName?: string | null;
  playerAccepted?: boolean;
  playerSignerName?: string | null;
};

/** Orden: distancia ascendente. Empates comparten posición (T1, T2…). */
export function rankClosestToPin(
  rows: RankInput[],
  maxPlaces: number = CLOSEST_TO_PIN_MAX_PRIZES
): ClosestToPinStanding[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.distanceCm !== b.distanceCm) return a.distanceCm - b.distanceCm;
    return a.playerName.localeCompare(b.playerName, "es");
  });

  const result: ClosestToPinStanding[] = [];
  let i = 0;
  while (i < sorted.length) {
    const dist = sorted[i]!.distanceCm;
    let j = i;
    while (j < sorted.length && sorted[j]!.distanceCm === dist) j += 1;
    const position = i + 1;
    const tied = j - i > 1;
    for (let k = i; k < j; k++) {
      const r = sorted[k]!;
      result.push({
        position,
        tied,
        entryId: r.entryId,
        playerName: r.playerName,
        categoryCode: r.categoryCode,
        distanceCm: r.distanceCm,
        groupNo: r.groupNo,
        capturistSigned: Boolean(r.capturistSigned),
        capturistSignerName: r.capturistSignerName ?? null,
        playerAccepted: Boolean(r.playerAccepted),
        playerSignerName: r.playerSignerName ?? null,
      });
    }
    i = j;
  }

  const truncated: ClosestToPinStanding[] = [];
  for (const row of result) {
    if (row.position > maxPlaces) break;
    truncated.push(row);
  }
  return truncated;
}
