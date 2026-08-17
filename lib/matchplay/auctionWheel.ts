/** Duración del giro (incluye overshoot). Pedido: 4–6 s. */
export const AUCTION_WHEEL_SPIN_MS = 5000;
/** Pausa con el nombre en el marco, antes del revelado grande. */
export const AUCTION_WHEEL_PAUSE_MS = 1000;

export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t));
}

/**
 * Progreso de índice de la rueda.
 *
 * 0–40% (~2.0 s): alta velocidad, nombres ilegibles.
 * 40–86% (~2.3 s): últimos ~4 nombres, cada uno más lento que el anterior
 *   (avance + pausa), que es lo que genera tensión en la sala.
 * 86–100% (~0.7 s): overshoot mínimo y asiento, como rueda física.
 */
export function wheelIndexProgress(
  t: number,
  startK: number,
  endK: number
): number {
  const x = clamp01(t);
  const overshoot = 0.26;
  const peak = endK + overshoot;
  const lingerCount = Math.min(3.5, Math.max(2, endK - startK - 0.5));
  const lingerFrom = endK - lingerCount;

  const tFast = 0.4;
  const tLinger = 0.86;

  if (x <= tFast) {
    const u = x / tFast;
    const e = 1 - Math.pow(1 - u, 1.2);
    return startK + (lingerFrom - startK) * e;
  }

  if (x <= tLinger) {
    const u = (x - tFast) / (tLinger - tFast);
    const weights = [1, 1.6, 2.5, 4.2];
    const sum = weights.reduce((a, b) => a + b, 0);
    let acc = 0;
    let idx = weights.length - 1;
    let local = 1;
    for (let i = 0; i < weights.length; i++) {
      const seg = weights[i] / sum;
      if (u < acc + seg || i === weights.length - 1) {
        idx = i;
        local = Math.min(1, Math.max(0, (u - acc) / seg));
        break;
      }
      acc += seg;
    }
    const move = Math.min(1, local / 0.52);
    const eased = 1 - Math.pow(1 - move, 2);
    const stepped = idx + eased;
    return lingerFrom + ((peak - lingerFrom) * stepped) / weights.length;
  }

  const u = (x - tLinger) / (1 - tLinger);
  const e = 1 - Math.pow(1 - u, 3);
  return peak + (endK - peak) * e;
}
