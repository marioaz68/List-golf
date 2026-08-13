/**
 * Handicap del reporte comité.
 *
 * CH_exact = HI × (Slope / 113) + (CR − Par)
 * CH 100 % (entero) = redondeo half-up de CH_exact
 * HP 80 % = redondeo half-up de (CH_exact × 0.80)
 *
 * Importante: el 80 % se aplica al CH decimal, NO al CH ya redondeado.
 * Recalcular HP desde el CH entero introduce un golpe de error en varios casos.
 *
 * Validación comité: HI 25.6 en Blancas (70.7 / 127 / 72)
 *   → CH_exact ≈ 27.47 → CH 27 → HP round(21.98) = 22
 */

export function roundHalfUp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n + 0.5);
}

/** WHS: promedio truncado a 1 decimal (no redondeado). */
export function truncateOneDecimal(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n * 10 + 1e-9) / 10;
}

export function courseHandicapExact(
  hi: number,
  slope: number,
  courseRating: number,
  par: number
): number {
  return hi * (slope / 113) + (courseRating - par);
}

export function courseHandicapInt(
  hi: number,
  slope: number,
  courseRating: number,
  par: number
): number {
  return roundHalfUp(courseHandicapExact(hi, slope, courseRating, par));
}

export function playingHandicap80(
  hi: number,
  slope: number,
  courseRating: number,
  par: number
): number {
  const exact = courseHandicapExact(hi, slope, courseRating, par);
  return roundHalfUp(exact * 0.8);
}

export function hiToChHp(
  hi: number,
  slope: number,
  courseRating: number,
  par: number
): { chExact: number; ch: number; hp: number } {
  const chExact = courseHandicapExact(hi, slope, courseRating, par);
  return {
    chExact,
    ch: roundHalfUp(chExact),
    hp: roundHalfUp(chExact * 0.8),
  };
}

/**
 * Golpes recibidos por hoyo según HP y stroke index (índice 0 = hoyo 1).
 * HP < 18: 1 golpe en los hoyos con SI ≤ HP.
 * HP ≥ 18: base = floor(HP/18) en todos + 1 extra en los (HP % 18) de SI más bajo.
 */
export function strokesReceivedByHole(
  playingHandicap: number,
  strokeIndex: number[]
): number[] {
  const hp = Math.max(0, Math.floor(playingHandicap));
  const n = strokeIndex.length;
  const out = new Array<number>(n).fill(0);
  if (hp <= 0) return out;

  if (hp < 18) {
    for (let i = 0; i < n; i++) {
      out[i] = strokeIndex[i]! <= hp ? 1 : 0;
    }
    return out;
  }

  const base = Math.floor(hp / 18);
  const extra = hp % 18;
  for (let i = 0; i < n; i++) out[i] = base;
  if (extra > 0) {
    const order = strokeIndex
      .map((si, i) => ({ si, i }))
      .sort((a, b) => a.si - b.si);
    for (let k = 0; k < extra && k < order.length; k++) {
      out[order[k]!.i]! += 1;
    }
  }
  return out;
}

export function colorVsPar(avg: number, par: number): string {
  const d = avg - par;
  if (d < 0) return "#2ecc71";
  if (d <= 0.5) return "#8fa3b8";
  if (d <= 1) return "#f5a623";
  return "#e74c3c";
}
