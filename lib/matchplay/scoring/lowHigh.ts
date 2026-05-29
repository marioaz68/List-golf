import {
  playingHandicap,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "@/lib/leaderboard/handicapStrokes";

/** Hoyo de referencia para SI/par/ventajas: 19↔1, 20↔2, …, 27↔9. */
export function playoffSourceHole(holeNo: number): number {
  if (holeNo >= 19 && holeNo <= 27) return holeNo - 18;
  return holeNo;
}

export type LowHighPlayerGross = {
  top_a: number | null;
  top_b: number | null;
  bottom_a: number | null;
  bottom_b: number | null;
};

export type LowHighPlayerNet = {
  top_a: number;
  top_b: number;
  bottom_a: number;
  bottom_b: number;
};

export type LowHighHoleBreakdown = {
  top: { low: number; high: number; low_pts: number; high_pts: number };
  bottom: { low: number; high: number; low_pts: number; high_pts: number };
  nets: LowHighPlayerNet;
  /** Golpes recibidos en este hoyo (match play bola baja/alta). */
  strokes_received: LowHighPlayerNet;
};

export type LowHighHoleResult = {
  top_points: number;
  bottom_points: number;
  breakdown: LowHighHoleBreakdown;
  match_status_after: string;
};

/** PH de juego relativo al más bajo del partido (four-ball match play). */
export function relativePhInMatch(
  courseHandicaps: [number, number, number, number]
): [number, number, number, number] {
  const min = Math.min(...courseHandicaps);
  return courseHandicaps.map((ph) => Math.max(0, ph - min)) as [
    number,
    number,
    number,
    number,
  ];
}

/**
 * Distribución de ventajas tipo "Bola Baja + Bola Alta" pareja vs pareja.
 *
 * Reglas (orden de los PHs: [topA, topB, bottomA, bottomB]):
 *  - Dentro de cada pareja se identifica al "bajo" y al "alto" por PH
 *    (menor PH = bajo; empate ⇒ el A queda como bajo).
 *  - Bajo de Top vs Bajo de Bottom: el de mayor PH recibe (alta − baja)
 *    golpes, repartidos por stroke index. El otro recibe 0.
 *  - Alto de Top vs Alto de Bottom: igual.
 *
 * Devuelve los golpes que recibe cada jugador en el mismo orden de entrada.
 * Cada jugador sólo recibe golpes de su "carril" (bajo vs bajo, o alto vs
 * alto); nunca se duplica.
 */
export function pairLowHighStrokes(
  ph: [number, number, number, number]
): [number, number, number, number] {
  const [phTopA, phTopB, phBotA, phBotB] = ph;

  const topAIsLow = phTopA <= phTopB;
  const bottomAIsLow = phBotA <= phBotB;

  const topLowPh = Math.min(phTopA, phTopB);
  const topHighPh = Math.max(phTopA, phTopB);
  const botLowPh = Math.min(phBotA, phBotB);
  const botHighPh = Math.max(phBotA, phBotB);

  // Carril bajo: la pareja con mayor "bajo" recibe la diferencia.
  const lowMin = Math.min(topLowPh, botLowPh);
  const topLowReceived = Math.max(0, topLowPh - lowMin);
  const botLowReceived = Math.max(0, botLowPh - lowMin);

  // Carril alto: la pareja con mayor "alto" recibe la diferencia.
  const highMin = Math.min(topHighPh, botHighPh);
  const topHighReceived = Math.max(0, topHighPh - highMin);
  const botHighReceived = Math.max(0, botHighPh - highMin);

  return [
    topAIsLow ? topLowReceived : topHighReceived,
    topAIsLow ? topHighReceived : topLowReceived,
    bottomAIsLow ? botLowReceived : botHighReceived,
    bottomAIsLow ? botHighReceived : botLowReceived,
  ];
}

/**
 * Fallback (sin slope/rating): se aplica solo % al HI. Solo se usa si no hay
 * PH almacenado en `tournament_entries`. Para el cálculo correcto WHS
 * usar `lib/handicap/whs.ts` y guardar el PH en la entry.
 */
export function courseHandicapFromHi(hi: number, allowancePct: number): number {
  return playingHandicap(hi, allowancePct);
}

function netOnHole(
  gross: number,
  relativePh: number,
  holeNo: number,
  strokeIndexByHole?: StrokeIndexByHole
): number {
  const si = strokeIndexForHole(holeNo, strokeIndexByHole);
  const received = strokesReceivedOnHole(relativePh, si);
  return gross - received;
}

function pointsFromComparison(
  topValue: number,
  bottomValue: number
): { top: number; bottom: number } {
  if (topValue < bottomValue) return { top: 1, bottom: 0 };
  if (bottomValue < topValue) return { top: 0, bottom: 1 };
  return { top: 0.5, bottom: 0.5 };
}

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Estado del partido en puntos acumulados (ej. "14–11 pts"). */
export function formatLowHighMatchStatus(
  topTotal: number,
  bottomTotal: number,
  holesPlayed: number,
  holesInMatch: number
): string {
  const remaining = Math.max(0, holesInMatch - holesPlayed);
  const base = `${formatPts(topTotal)}–${formatPts(bottomTotal)} pts`;
  if (remaining === 0) return base;
  return `${base} (${remaining} por jugar)`;
}

export function scoreLowHighHole(params: {
  hole_no: number;
  gross: LowHighPlayerGross;
  /** HI efectivo por jugador: top_a, top_b, bottom_a, bottom_b */
  hi: [number, number, number, number];
  allowance_pct: number;
  /**
   * Si se proporciona, se usa como PH oficial de cada jugador (ya con
   * allowance% aplicado vía WHS). Si no, se calcula desde HI × %.
   */
  playing_handicaps?: [
    number | null,
    number | null,
    number | null,
    number | null,
  ];
  strokeIndexByHole?: StrokeIndexByHole;
  top_total_before: number;
  bottom_total_before: number;
  holes_in_match: number;
}): LowHighHoleResult | null {
  const { hole_no, gross, hi, allowance_pct, strokeIndexByHole, playing_handicaps } = params;
  const g = gross;

  if (
    g.top_a == null ||
    g.top_b == null ||
    g.bottom_a == null ||
    g.bottom_b == null
  ) {
    return null;
  }

  const ph = (playing_handicaps ?? [null, null, null, null]).map((stored, i) => {
    if (stored != null && Number.isFinite(stored)) return Number(stored);
    return courseHandicapFromHi(hi[i], allowance_pct);
  }) as [number, number, number, number];
  const [rTopA, rTopB, rBotA, rBotB] = pairLowHighStrokes(ph);
  // En desempate (19-27) las ventajas siguen el SI del hoyo físico 1-9.
  const si = strokeIndexForHole(playoffSourceHole(hole_no), strokeIndexByHole);
  const strokes_received: LowHighPlayerNet = {
    top_a: strokesReceivedOnHole(rTopA, si),
    top_b: strokesReceivedOnHole(rTopB, si),
    bottom_a: strokesReceivedOnHole(rBotA, si),
    bottom_b: strokesReceivedOnHole(rBotB, si),
  };

  const nets: LowHighPlayerNet = {
    top_a: g.top_a - strokes_received.top_a,
    top_b: g.top_b - strokes_received.top_b,
    bottom_a: g.bottom_a - strokes_received.bottom_a,
    bottom_b: g.bottom_b - strokes_received.bottom_b,
  };

  const topLow = Math.min(nets.top_a, nets.top_b);
  const topHigh = Math.max(nets.top_a, nets.top_b);
  const bottomLow = Math.min(nets.bottom_a, nets.bottom_b);
  const bottomHigh = Math.max(nets.bottom_a, nets.bottom_b);

  const lowCmp = pointsFromComparison(topLow, bottomLow);
  const highCmp = pointsFromComparison(topHigh, bottomHigh);

  const top_points = lowCmp.top + highCmp.top;
  const bottom_points = lowCmp.bottom + highCmp.bottom;

  const top_total = params.top_total_before + top_points;
  const bottom_total = params.bottom_total_before + bottom_points;
  const holes_played = hole_no;

  return {
    top_points,
    bottom_points,
    breakdown: {
      top: {
        low: topLow,
        high: topHigh,
        low_pts: lowCmp.top,
        high_pts: highCmp.top,
      },
      bottom: {
        low: bottomLow,
        high: bottomHigh,
        low_pts: lowCmp.bottom,
        high_pts: highCmp.bottom,
      },
      nets,
      strokes_received,
    },
    match_status_after: formatLowHighMatchStatus(
      top_total,
      bottom_total,
      holes_played,
      params.holes_in_match
    ),
  };
}

export function aggregateLowHighTotals(
  holes: Array<{ top_points: number; bottom_points: number }>
): { top: number; bottom: number } {
  return holes.reduce(
    (acc, h) => ({
      top: acc.top + h.top_points,
      bottom: acc.bottom + h.bottom_points,
    }),
    { top: 0, bottom: 0 }
  );
}

export function decideLowHighWinner(
  topTotal: number,
  bottomTotal: number
): "top" | "bottom" | "halved" | null {
  if (topTotal > bottomTotal) return "top";
  if (bottomTotal > topTotal) return "bottom";
  if (topTotal === bottomTotal && topTotal > 0) return "halved";
  return null;
}

/**
 * Match terminado por marcador: cada hoyo pareja-vs-pareja en formato
 * Bola Baja + Bola Alta entrega como máximo 2 puntos (1 para la pareja
 * que gana low + 1 para la que gana high). Por lo tanto, si tras el
 * hoyo `holeNo` la diferencia de puntos es estrictamente mayor que los
 * puntos máximos que quedan por jugar (`(holesInMatch - holeNo) * 2`),
 * el match está matemáticamente decidido y no hay que jugar los hoyos
 * restantes. Equivale a "X-Y, M hoyos restantes" en match play clásico.
 *
 * - Devuelve "top"/"bottom" si quedó decidido en ese hoyo.
 * - Devuelve null si aún hay manera de igualar (incluye dormie exacto).
 */
export function isLowHighMatchDecidedAt(params: {
  top_total: number;
  bottom_total: number;
  hole_no: number;
  holes_in_match: number;
}): "top" | "bottom" | null {
  const { top_total, bottom_total, hole_no, holes_in_match } = params;
  const remaining = Math.max(0, holes_in_match - hole_no);
  const maxRemaining = remaining * 2;
  const diff = top_total - bottom_total;
  if (Math.abs(diff) > maxRemaining) {
    return diff > 0 ? "top" : "bottom";
  }
  return null;
}

/**
 * Texto tipo "5–0 a falta de 4 hoyos" para mostrar al usuario el
 * resultado de un match concedido por marcador.
 */
export function formatLowHighDecisionResult(params: {
  winner_label: string;
  top_total: number;
  bottom_total: number;
  decided_at_hole: number;
  holes_in_match: number;
}): string {
  const { winner_label, top_total, bottom_total, decided_at_hole, holes_in_match } = params;
  const hi = Math.max(top_total, bottom_total);
  const lo = Math.min(top_total, bottom_total);
  const remaining = Math.max(0, holes_in_match - decided_at_hole);
  const tail =
    remaining === 0
      ? ""
      : ` · ${remaining} ${remaining === 1 ? "hoyo" : "hoyos"} por jugar`;
  return `${winner_label} gana ${formatPts(hi)}–${formatPts(lo)} en H${decided_at_hole}${tail}`;
}
