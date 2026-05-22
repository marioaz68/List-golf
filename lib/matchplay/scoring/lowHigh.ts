import {
  playingHandicap,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "@/lib/leaderboard/handicapStrokes";

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
  strokeIndexByHole?: StrokeIndexByHole;
  top_total_before: number;
  bottom_total_before: number;
  holes_in_match: number;
}): LowHighHoleResult | null {
  const { hole_no, gross, hi, allowance_pct, strokeIndexByHole } = params;
  const g = gross;

  if (
    g.top_a == null ||
    g.top_b == null ||
    g.bottom_a == null ||
    g.bottom_b == null
  ) {
    return null;
  }

  const ph = hi.map((h) => courseHandicapFromHi(h, allowance_pct)) as [
    number,
    number,
    number,
    number,
  ];
  const [rTopA, rTopB, rBotA, rBotB] = relativePhInMatch(ph);

  const nets: LowHighPlayerNet = {
    top_a: netOnHole(g.top_a, rTopA, hole_no, strokeIndexByHole),
    top_b: netOnHole(g.top_b, rTopB, hole_no, strokeIndexByHole),
    bottom_a: netOnHole(g.bottom_a, rBotA, hole_no, strokeIndexByHole),
    bottom_b: netOnHole(g.bottom_b, rBotB, hole_no, strokeIndexByHole),
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
