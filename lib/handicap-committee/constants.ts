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
