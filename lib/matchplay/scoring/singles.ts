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

export type SinglesPlayerGross = {
  top: number | null;
  bottom: number | null;
};

export type SinglesPlayerSide = {
  gross: number | null;
  net: number;
  strokes_received: number;
};

export type SinglesHoleBreakdown = {
  top: SinglesPlayerSide;
  bottom: SinglesPlayerSide;
  /** Quién se llevó el punto del hoyo (1 punto en individual). */
  hole_winner: "top" | "bottom" | "halved" | null;
};

export type SinglesHoleResult = {
  top_points: number;
  bottom_points: number;
  breakdown: SinglesHoleBreakdown;
  match_status_after: string;
};

/**
 * Fallback (sin slope/rating): se aplica solo % al HI. Solo se usa si no hay
 * PH almacenado en `tournament_entries`. Para el cálculo correcto WHS
 * usar `lib/handicap/whs.ts` y guardar el PH en la entry.
 */
export function courseHandicapFromHi(hi: number, allowancePct: number): number {
  return playingHandicap(hi, allowancePct);
}

/**
 * Ventaja USGA de match play individual: la diferencia entera entre los
 * dos Playing Handicaps se le da al de PH más alto; el más bajo juega
 * scratch relativo. Devuelve los golpes relativos en el mismo orden.
 *
 * Distinto de `pairLowHighStrokes` (carriles bola baja / bola alta).
 */
export function singlesRelativeStrokes(
  ph: [number, number]
): [number, number] {
  const [a, b] = ph;
  const min = Math.min(a, b);
  return [Math.max(0, a - min), Math.max(0, b - min)];
}

/**
 * En match play individual cada hoyo entrega 1 punto al ganador neto,
 * 0 al perdedor y, si empatan, se reparte como `0.5 – 0.5`. La diferencia
 * de puntos acumulados equivale a la ventaja en hoyos del match play
 * clásico (por eso el cierre se expresa como "3&2" o "1 UP").
 */
function pointsFromComparison(
  topValue: number,
  bottomValue: number
): { top: number; bottom: number; winner: "top" | "bottom" | "halved" } {
  if (topValue < bottomValue) return { top: 1, bottom: 0, winner: "top" };
  if (bottomValue < topValue) return { top: 0, bottom: 1, winner: "bottom" };
  return { top: 0.5, bottom: 0.5, winner: "halved" };
}

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Estado del partido en ventaja de hoyos (match play individual).
 * En juego: "2 arriba · H14" o "AS · H14". Terminado sin cierre anticipado:
 * "1 arriba" o "AS".
 */
export function formatSinglesMatchStatus(
  topTotal: number,
  bottomTotal: number,
  holesPlayed: number,
  holesInMatch: number
): string {
  const remaining = Math.max(0, holesInMatch - holesPlayed);
  const lead = Math.abs(topTotal - bottomTotal);
  const base = lead === 0 ? "AS" : `${formatPts(lead)} arriba`;
  if (remaining === 0) return base;
  return `${base} · H${holesPlayed}`;
}

export function scoreSinglesHole(params: {
  hole_no: number;
  gross: SinglesPlayerGross;
  /** HI efectivo por jugador: top, bottom */
  hi: [number, number];
  allowance_pct: number;
  /**
   * Si se proporciona, se usa como PH oficial de cada jugador (ya con
   * allowance% aplicado vía WHS). Si no, se calcula desde HI × %.
   * El PH almacenado tiene prioridad para que un cambio de configuración
   * no altere ventajas ya asignadas.
   */
  playing_handicaps?: [number | null, number | null];
  strokeIndexByHole?: StrokeIndexByHole;
  top_total_before: number;
  bottom_total_before: number;
  holes_in_match: number;
  /** Match play: jugadores que no terminaron el hoyo (levantaron / X).
   *  Mismo orden que `gross` [top, bottom]. Reglas:
   *   - Quien levantó cuenta como infinito y pierde el hoyo.
   *   - Si los dos levantaron: 0 y 0 (nadie compite). */
  picked_up?: [boolean, boolean];
}): SinglesHoleResult | null {
  const {
    hole_no,
    gross,
    hi,
    allowance_pct,
    strokeIndexByHole,
    playing_handicaps,
  } = params;
  const pickedUp = params.picked_up ?? [false, false];

  // Se acepta levantó (X). Para calcular puntos sólo se requiere que los
  // jugadores que NO levantaron tengan score.
  const need = (val: number | null, picked: boolean) => picked || val != null;
  if (!need(gross.top, pickedUp[0]) || !need(gross.bottom, pickedUp[1])) {
    return null;
  }

  const ph = (playing_handicaps ?? [null, null]).map((stored, i) => {
    if (stored != null && Number.isFinite(stored)) return Number(stored);
    return courseHandicapFromHi(hi[i], allowance_pct);
  }) as [number, number];
  const [rTop, rBot] = singlesRelativeStrokes(ph);
  // En desempate (19-27) las ventajas siguen el SI del hoyo físico 1-9.
  const si = strokeIndexForHole(playoffSourceHole(hole_no), strokeIndexByHole);
  const strokesTop = strokesReceivedOnHole(rTop, si);
  const strokesBottom = strokesReceivedOnHole(rBot, si);

  // El jugador que levantó cuenta como infinito (peor net posible) y
  // pierde automáticamente el hoyo frente a cualquier número.
  const netOrInf = (g: number | null, sr: number, picked: boolean) =>
    picked || g == null ? Number.POSITIVE_INFINITY : g - sr;

  const netTop = netOrInf(gross.top, strokesTop, pickedUp[0]);
  const netBottom = netOrInf(gross.bottom, strokesBottom, pickedUp[1]);

  let top_points = 0;
  let bottom_points = 0;
  let hole_winner: SinglesHoleBreakdown["hole_winner"] = null;

  if (pickedUp[0] && pickedUp[1]) {
    // Ambos levantaron: nadie compite.
    top_points = 0;
    bottom_points = 0;
    hole_winner = null;
  } else {
    const cmp = pointsFromComparison(netTop, netBottom);
    top_points = cmp.top;
    bottom_points = cmp.bottom;
    hole_winner = cmp.winner;
  }

  const top_total = params.top_total_before + top_points;
  const bottom_total = params.bottom_total_before + bottom_points;
  const holes_played = hole_no;

  return {
    top_points,
    bottom_points,
    breakdown: {
      top: {
        gross: gross.top,
        net: netTop,
        strokes_received: strokesTop,
      },
      bottom: {
        gross: gross.bottom,
        net: netBottom,
        strokes_received: strokesBottom,
      },
      hole_winner,
    },
    match_status_after: formatSinglesMatchStatus(
      top_total,
      bottom_total,
      holes_played,
      params.holes_in_match
    ),
  };
}

export function aggregateSinglesTotals(
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

export function decideSinglesWinner(
  topTotal: number,
  bottomTotal: number
): "top" | "bottom" | "halved" | null {
  if (topTotal > bottomTotal) return "top";
  if (bottomTotal > topTotal) return "bottom";
  if (topTotal === bottomTotal && topTotal > 0) return "halved";
  return null;
}

/**
 * Match terminado por marcador: en individual cada hoyo entrega como
 * máximo 1 punto. Por lo tanto, si tras el hoyo `holeNo` la diferencia
 * de puntos es estrictamente mayor que los hoyos que quedan por jugar
 * (`holesInMatch - holeNo`), el match está matemáticamente decidido.
 *
 * - Devuelve "top"/"bottom" si quedó decidido en ese hoyo.
 * - Devuelve null si aún hay manera de igualar (incluye dormie exacto:
 *   p. ej. 2 arriba con 2 por jugar).
 */
export function isSinglesMatchDecidedAt(params: {
  top_total: number;
  bottom_total: number;
  hole_no: number;
  holes_in_match: number;
}): "top" | "bottom" | null {
  const { top_total, bottom_total, hole_no, holes_in_match } = params;
  const remaining = Math.max(0, holes_in_match - hole_no);
  const maxRemaining = remaining;
  const diff = top_total - bottom_total;
  if (Math.abs(diff) > maxRemaining) {
    return diff > 0 ? "top" : "bottom";
  }
  return null;
}

/**
 * Notación clásica de match play individual:
 *   - 3 arriba con 2 por jugar → "3&2"
 *   - 1 arriba al hoyo 18 → "1 UP"
 *   - Empate al 18 → "AS"
 *   - Desempate → "Desempate H2 · 1 arriba" (hoyo vía playoffSourceHole)
 */
export function formatSinglesDecisionResult(params: {
  winner_label: string;
  top_total: number;
  bottom_total: number;
  decided_at_hole: number;
  holes_in_match: number;
  via_playoff?: boolean;
}): string {
  const {
    top_total,
    bottom_total,
    decided_at_hole,
    holes_in_match,
    via_playoff,
  } = params;
  const lead = Math.abs(top_total - bottom_total);
  const holesRemaining = Math.max(0, holes_in_match - decided_at_hole);

  if (via_playoff) {
    const src = playoffSourceHole(decided_at_hole);
    if (lead === 0) return `Desempate H${src} · AS`;
    return `Desempate H${src} · ${formatPts(lead)} arriba`;
  }

  if (lead === 0) return "AS";
  if (holesRemaining === 0) return `${formatPts(lead)} UP`;
  return `${formatPts(lead)}&${holesRemaining}`;
}
