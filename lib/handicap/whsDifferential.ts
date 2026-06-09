/**
 * Cálculos básicos WHS (World Handicap System) para rondas individuales.
 *
 * Por ahora implementamos el cálculo simple del diferencial:
 *
 *   Diferencial = (Adjusted Gross Score - Course Rating) × 113 / Slope Rating
 *
 * NO incluye Equity Stroke Control (ESC / net double bogey cap) — esa
 * funcionalidad se agregará en fase posterior junto con cálculo de HI
 * (promedio de mejores 8 de últimos 20).
 *
 * Referencia: https://www.usga.org/handicapping/whs/rules-of-handicapping.html
 */

export interface DifferentialInput {
  /** Score bruto AJUSTADO (con ESC aplicado si aplica). Por ahora aceptamos
   *  el gross sin ajuste — futuro: aplicar net double bogey. */
  adjustedGross: number;
  /** Course rating del tee jugado (decimal, ej. 73.2). */
  courseRating: number;
  /** Slope rating del tee jugado (55-155, default 113). */
  slope: number;
  /** PCC (Playing Conditions Calculation) en stroke. Default 0. */
  pcc?: number;
}

/** Calcula el diferencial WHS para una ronda 18 hoyos. */
export function computeDifferential(input: DifferentialInput): number {
  const { adjustedGross, courseRating, slope, pcc = 0 } = input;
  if (!Number.isFinite(adjustedGross)) return 0;
  if (!Number.isFinite(courseRating)) return 0;
  if (!Number.isFinite(slope) || slope <= 0) return 0;
  const raw = ((adjustedGross - courseRating - pcc) * 113) / slope;
  // Redondear a 1 decimal (norma WHS)
  return Math.round(raw * 10) / 10;
}

/**
 * Calcula HI (Handicap Index) a partir de un histórico de diferenciales.
 * Regla WHS:
 *   - Toma los últimos 20 scores.
 *   - Promedia los 8 mejores diferenciales (los más bajos).
 *   - Si hay < 20, aplica reglas de transición simplificadas:
 *     * 3 scores  → toma el más bajo, resta 2.0
 *     * 4 scores  → toma el más bajo, resta 1.0
 *     * 5 scores  → toma el más bajo
 *     * 6 scores  → promedio de los 2 mejores, resta 1.0
 *     * 7-8       → promedio de los 2 mejores
 *     * 9-11      → promedio de los 3 mejores
 *     * 12-14     → promedio de los 4 mejores
 *     * 15-16     → promedio de los 5 mejores
 *     * 17-18     → promedio de los 6 mejores
 *     * 19        → promedio de los 7 mejores
 *     * 20+       → promedio de los 8 mejores
 *
 * Devuelve null si no hay scores válidos.
 */
export function computeHandicapIndex(
  differentials: number[]
): { hi: number; usedCount: number; totalCount: number } | null {
  if (!Array.isArray(differentials)) return null;
  const valid = differentials
    .filter((d) => Number.isFinite(d))
    .slice(-20);
  if (valid.length === 0) return null;

  const sorted = [...valid].sort((a, b) => a - b);
  const n = sorted.length;
  let used: number[];
  let adjustment = 0;

  if (n >= 20) used = sorted.slice(0, 8);
  else if (n === 19) used = sorted.slice(0, 7);
  else if (n >= 17) used = sorted.slice(0, 6);
  else if (n >= 15) used = sorted.slice(0, 5);
  else if (n >= 12) used = sorted.slice(0, 4);
  else if (n >= 9) used = sorted.slice(0, 3);
  else if (n >= 7) used = sorted.slice(0, 2);
  else if (n === 6) {
    used = sorted.slice(0, 2);
    adjustment = -1.0;
  } else if (n === 5) used = sorted.slice(0, 1);
  else if (n === 4) {
    used = sorted.slice(0, 1);
    adjustment = -1.0;
  } else if (n === 3) {
    used = sorted.slice(0, 1);
    adjustment = -2.0;
  } else {
    // 1 o 2 scores → no se considera HI oficial, regresar el mejor para mostrar
    used = sorted.slice(0, 1);
  }

  const sum = used.reduce((s, d) => s + d, 0);
  const hi = Math.round((sum / used.length + adjustment) * 10) / 10;
  return { hi, usedCount: used.length, totalCount: n };
}
