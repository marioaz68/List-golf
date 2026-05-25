/** Ajuste solo a la baja: valores negativos sumados al HI del inscrito. */
export const HANDICAP_ADJUSTMENT_MIN = -5.0;
export const HANDICAP_ADJUSTMENT_MAX = -0.5;
export const HANDICAP_ADJUSTMENT_STEP = 0.1;
export const HANDICAP_COMMITTEE_DEFAULT_SIZE = 9;

export function formatAdjustmentLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  if (n === 0) return "0";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}

export function clampAdjustment(raw: number) {
  const n = Math.round(raw * 10) / 10;
  return Math.min(HANDICAP_ADJUSTMENT_MAX, Math.max(HANDICAP_ADJUSTMENT_MIN, n));
}

/**
 * Devuelve los índices (sobre el array ordenado de menor a mayor) que se
 * descartan: los `trimLow` más bajos y los `trimHigh` más altos.
 * Si la cantidad de votos vivos no es suficiente, se conservan al menos 1.
 */
export type TrimmedAverage = {
  values: { value: number; trimmed: boolean; reason: "low" | "high" | null }[];
  avg: number | null;
  liveCount: number;
};

export function trimmedAverage(
  rawValues: number[],
  trimLow: number,
  trimHigh: number
): TrimmedAverage {
  const valid = rawValues
    .filter((v) => Number.isFinite(v))
    .map((v) => Number(v));
  if (valid.length === 0) {
    return { values: [], avg: null, liveCount: 0 };
  }

  const sortedAsc = [...valid].sort((a, b) => a - b);
  const total = sortedAsc.length;

  let cutLow = Math.max(0, Math.trunc(trimLow));
  let cutHigh = Math.max(0, Math.trunc(trimHigh));

  while (cutLow + cutHigh >= total && cutLow + cutHigh > 0) {
    if (cutLow >= cutHigh && cutLow > 0) cutLow -= 1;
    else if (cutHigh > 0) cutHigh -= 1;
  }

  const lowSet = new Map<number, number>();
  for (let i = 0; i < cutLow; i += 1) {
    const v = sortedAsc[i];
    lowSet.set(v, (lowSet.get(v) ?? 0) + 1);
  }
  const highSet = new Map<number, number>();
  for (let i = total - cutHigh; i < total; i += 1) {
    const v = sortedAsc[i];
    highSet.set(v, (highSet.get(v) ?? 0) + 1);
  }

  const lowConsumed = new Map<number, number>();
  const highConsumed = new Map<number, number>();
  let liveSum = 0;
  let liveCount = 0;

  const tagged = rawValues.map((raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      return { value: 0, trimmed: true as const, reason: null as null };
    }

    const lowNeed = lowSet.get(v) ?? 0;
    const lowUsed = lowConsumed.get(v) ?? 0;
    if (lowUsed < lowNeed) {
      lowConsumed.set(v, lowUsed + 1);
      return { value: v, trimmed: true as const, reason: "low" as const };
    }

    const highNeed = highSet.get(v) ?? 0;
    const highUsed = highConsumed.get(v) ?? 0;
    if (highUsed < highNeed) {
      highConsumed.set(v, highUsed + 1);
      return { value: v, trimmed: true as const, reason: "high" as const };
    }

    liveSum += v;
    liveCount += 1;
    return { value: v, trimmed: false as const, reason: null as null };
  });

  const avg = liveCount > 0 ? liveSum / liveCount : null;

  return {
    values: tagged,
    avg,
    liveCount,
  };
}
