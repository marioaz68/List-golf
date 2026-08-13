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
 * Mínimo de votos numéricos para que sobreviva al menos uno tras el recorte
 * (trim_low + trim_high + 1). No se reduce el trim si hay menos.
 */
export function minNumericVotesForTrim(
  trimLow: number,
  trimHigh: number
): number {
  return (
    Math.max(0, Math.trunc(trimLow)) + Math.max(0, Math.trunc(trimHigh)) + 1
  );
}

/**
 * Aviso cuando el recorte anula todos los ajustes numéricos.
 * N y el mínimo se calculan; no están cableados.
 */
export function formatTrimAnnulledNote(
  nNumericVotes: number,
  trimLow: number,
  trimHigh: number
): string {
  const min = minNumericVotesForTrim(trimLow, trimHigh);
  return `Sin ajuste: ${nNumericVotes} votos numéricos, insuficientes para el recorte configurado (se requieren al menos ${min})`;
}

/**
 * Devuelve los índices (sobre el array ordenado de menor a mayor) que se
 * descartan: los `trimLow` más bajos y los `trimHigh` más altos.
 */
export type TrimmedAverageChip = {
  value: number;
  trimmed: boolean;
  reason: "low" | "high" | null;
};

export type TrimmedAverage = {
  values: TrimmedAverageChip[];
  avg: number | null;
  /** Votos numéricos que sobreviven al recorte (sin contar abstenciones). */
  liveCount: number;
  /**
   * Abstenciones pasadas al cálculo. Solo entran al denominador si
   * `includeAbstentionsInAverage` es true.
   */
  liveAbstainedAsZero: number;
  /** Denominador del promedio (solo vivos numéricos, ± abstenciones si aplica). */
  averageDenominator: number;
  /**
   * Había votos numéricos pero el recorte configurado los anuló todos.
   * Distinto de «nadie propuso ajuste» (avg null, trimAnnulled false).
   */
  trimAnnulled: boolean;
};

/**
 * Chip de distribución de votos. Las abstenciones se muestran como chips
 * con valor 0 para el reporte; si cuentan o no en el promedio lo decide
 * `trimmedAverage` / la config del comité.
 */
export type DistributionChip = TrimmedAverageChip & { abstained: boolean };

/**
 * Convierte la salida de `trimmedAverage` en una lista única de chips.
 * Las abstenciones se agregan como entradas con `value = 0` para
 * visualización; no implica que entren al denominador.
 */
export function distributionChips(
  values: TrimmedAverageChip[] | null | undefined,
  abstentionCount: number = 0
): DistributionChip[] {
  const chips: DistributionChip[] = (values ?? []).map((v) => ({
    ...v,
    abstained: false,
  }));
  const n = Math.max(0, Math.trunc(abstentionCount));
  for (let i = 0; i < n; i += 1) {
    chips.push({ value: 0, trimmed: false, reason: null, abstained: true });
  }
  return chips;
}

/**
 * Calcula promedio recortado.
 *
 * - `rawValues`: ajustes numéricos (votos con calificación).
 * - `trimLow` / `trimHigh`: cuántos extremos descartar. NO se reduce el
 *   recorte si hay pocos votos: si no sobrevive ninguno, avg = 0 y
 *   `trimAnnulled = true`.
 * - `abstentionCount`: metadato de abstenciones.
 * - `includeAbstentionsInAverage`: si true, las abstenciones suman al
 *   denominador como 0. Default false (solo ajustes numéricos vivos).
 */
export function trimmedAverage(
  rawValues: number[],
  trimLow: number,
  trimHigh: number,
  abstentionCount: number = 0,
  includeAbstentionsInAverage: boolean = false
): TrimmedAverage {
  const valid = rawValues
    .filter((v) => Number.isFinite(v))
    .map((v) => Number(v));
  const abstCount = Math.max(0, Math.trunc(abstentionCount));
  const abstInAvg = includeAbstentionsInAverage
    ? abstCount
    : 0;

  if (valid.length === 0) {
    if (abstInAvg > 0) {
      return {
        values: [],
        avg: 0,
        liveCount: 0,
        liveAbstainedAsZero: abstInAvg,
        averageDenominator: abstInAvg,
        trimAnnulled: false,
      };
    }
    return {
      values: [],
      avg: null,
      liveCount: 0,
      liveAbstainedAsZero: 0,
      averageDenominator: 0,
      trimAnnulled: false,
    };
  }

  const sortedAsc = [...valid].sort((a, b) => a - b);
  const total = sortedAsc.length;

  const cutLow = Math.max(0, Math.trunc(trimLow));
  const cutHigh = Math.max(0, Math.trunc(trimHigh));

  // No se salta el trim: si cutLow+cutHigh >= total, todos quedan anulados.
  const lowSet = new Map<number, number>();
  for (let i = 0; i < Math.min(cutLow, total); i += 1) {
    const v = sortedAsc[i];
    lowSet.set(v, (lowSet.get(v) ?? 0) + 1);
  }
  const highSet = new Map<number, number>();
  const highStart = Math.max(0, total - cutHigh);
  for (let i = highStart; i < total; i += 1) {
    // Evitar doble conteo si el mismo índice cae en low y high.
    if (i < Math.min(cutLow, total)) continue;
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

  const numericLiveCount = liveCount;
  const trimAnnulled = numericLiveCount === 0;
  const averageDenominator = numericLiveCount + abstInAvg;

  let avg: number | null;
  if (trimAnnulled) {
    // Había votos numéricos pero el trim los anuló → ajuste 0 (HI sin cambio).
    avg = 0;
  } else if (averageDenominator > 0) {
    avg = liveSum / averageDenominator;
  } else {
    avg = null;
  }

  return {
    values: tagged,
    avg,
    liveCount: numericLiveCount,
    liveAbstainedAsZero: abstInAvg,
    averageDenominator,
    trimAnnulled,
  };
}
