import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import {
  completedStrokeCount,
  inferRoundStartHole,
  isHoleFinished,
  roundHoleOrder,
  roundStrokeTotals,
  shotsForHole,
  type HoleShot,
  type HoleShotsStore,
} from "@/lib/distances/holeShots";

export type ParByHole = Record<number, number>;

export interface HoleYardageStats {
  hole: number;
  par: number;
  /** Hoyo con al menos un golpe completado o salida marcada. */
  played: boolean;
  /** Hoyo cerrado (entré / dada). */
  finished: boolean;
  score: number;
  toPar: number | null;
  putts: number;
  gir: boolean | null;
  fairwayHit: boolean | null;
  bunkerHit: boolean;
  scramble: boolean | null;
  sandSave: boolean | null;
  birdieOrBetter: boolean | null;
  onePutt: boolean | null;
  drivingYards: number | null;
  plannedVsActualAvg: number | null;
}

export interface RoundYardageStats {
  startHole: number;
  holesPlayed: number;
  holesFinished: number;
  totalScore: number;
  totalPar: number;
  toPar: number;
  totalPutts: number;
  puttsPerGir: number | null;
  fairwaysHit: number;
  fairwaysPossible: number;
  fairwayPct: number | null;
  girCount: number;
  girPossible: number;
  girPct: number | null;
  scrambles: number;
  scrambleOpportunities: number;
  scramblePct: number | null;
  sandSaves: number;
  sandSaveOpportunities: number;
  sandSavePct: number | null;
  birdiesOrBetter: number;
  onePutts: number;
  avgDrivingYards: number | null;
  avgPlannedVsActual: number | null;
  strokeTotals: ReturnType<typeof roundStrokeTotals>;
  byHole: HoleYardageStats[];
}

function defaultParByHole(): ParByHole {
  const out: ParByHole = {};
  for (let h = 1; h <= 18; h++) {
    out[h] = CCQ_HOLE_POINTS[h]?.par ?? 4;
  }
  return out;
}

export function resolveParByHole(pars?: ParByHole): ParByHole {
  if (!pars || Object.keys(pars).length === 0) return defaultParByHole();
  const base = defaultParByHole();
  return { ...base, ...pars };
}

function completedShots(shots: HoleShot[]): HoleShot[] {
  return shots.filter((s) => s.completedAt != null);
}

function nonPenaltyCompleted(shots: HoleShot[]): HoleShot[] {
  return completedShots(shots).filter((s) => !s.isPenalty);
}

/** Golpes hasta el primer contacto con el green (incluye castigos). */
export function strokesToGreen(shots: HoleShot[]): number | null {
  let count = 0;
  for (const s of completedShots(shots)) {
    count++;
    if (s.lieKind === "green" || s.lieKind === "given") return count;
  }
  return null;
}

/** Putts = golpes con la bola ya en el green, más putts concedidos. */
export function countPuttsOnHole(shots: HoleShot[]): number {
  const done = completedShots(shots);
  let putts = 0;
  let ballOnGreen = false;

  for (const s of done) {
    if (s.isPenalty) continue;

    if (s.lieKind === "given") {
      putts++;
      ballOnGreen = true;
      continue;
    }

    if (ballOnGreen) {
      putts++;
    }

    if (s.lieKind === "green") {
      ballOnGreen = true;
    }
  }

  return putts;
}

export function isGreenInRegulation(shots: HoleShot[], par: number): boolean | null {
  const toGreen = strokesToGreen(shots);
  if (toGreen == null) return null;
  return toGreen <= par - 2;
}

export function isFairwayHit(shots: HoleShot[], par: number): boolean | null {
  if (par <= 3) return null;
  const first = nonPenaltyCompleted(shots)[0];
  if (!first) return null;
  return first.lieKind === "fairway";
}

export function drivingDistanceYards(shots: HoleShot[], par: number): number | null {
  if (par <= 3) return null;
  const first = nonPenaltyCompleted(shots)[0];
  if (!first || first.actualYards == null || first.actualYards <= 0) return null;
  return first.actualYards;
}

function avgPlannedVsActual(shots: HoleShot[]): number | null {
  const deltas: number[] = [];
  for (const s of nonPenaltyCompleted(shots)) {
    if (s.actualYards == null || s.isPenalty) continue;
    deltas.push(s.actualYards - s.plannedYards);
  }
  if (deltas.length === 0) return null;
  return Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10;
}

function holeHasActivity(store: HoleShotsStore, hole: number): boolean {
  const shots = shotsForHole(store, hole);
  if (shots.some((s) => s.completedAt != null)) return true;
  return Boolean(store.teeMarkByHole[String(hole)]);
}

export function computeHoleYardageStats(
  store: HoleShotsStore,
  hole: number,
  par: number
): HoleYardageStats {
  const shots = shotsForHole(store, hole);
  const played = holeHasActivity(store, hole);
  const finished = isHoleFinished(store, hole);
  const score = completedStrokeCount(store, hole);
  const putts = countPuttsOnHole(shots);
  const gir = played ? isGreenInRegulation(shots, par) : null;
  const fairwayHit = played ? isFairwayHit(shots, par) : null;
  const bunkerHit = shots.some(
    (s) => s.completedAt != null && s.lieKind === "bunker"
  );
  const toPar = played && score > 0 ? score - par : null;
  const birdieOrBetter =
    played && score > 0 ? score <= par - 1 : null;
  const onePutt = played && putts > 0 ? putts === 1 : null;
  const scramble =
    played && gir === false && score > 0
      ? score <= par
      : gir === true
        ? false
        : null;
  const sandSave =
    bunkerHit && score > 0 ? score <= par : bunkerHit ? false : null;

  return {
    hole,
    par,
    played,
    finished,
    score,
    toPar,
    putts,
    gir,
    fairwayHit,
    bunkerHit,
    scramble,
    sandSave,
    birdieOrBetter,
    onePutt,
    drivingYards: played ? drivingDistanceYards(shots, par) : null,
    plannedVsActualAvg: played ? avgPlannedVsActual(shots) : null,
  };
}

function pct(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num / den) * 1000) / 10;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function computeRoundYardageStats(
  store: HoleShotsStore,
  pars?: ParByHole
): RoundYardageStats {
  const parMap = resolveParByHole(pars);
  const startHole = inferRoundStartHole(store);
  const order = roundHoleOrder(startHole);
  const byHole = order.map((h) =>
    computeHoleYardageStats(store, h, parMap[h] ?? 4)
  );

  const playedHoles = byHole.filter((h) => h.played);
  const finishedHoles = byHole.filter((h) => h.finished);
  const totalScore = playedHoles.reduce((a, h) => a + h.score, 0);
  const totalPar = playedHoles.reduce((a, h) => a + h.par, 0);
  const totalPutts = playedHoles.reduce((a, h) => a + h.putts, 0);

  const girHoles = playedHoles.filter((h) => h.gir != null);
  const girCount = girHoles.filter((h) => h.gir).length;
  const puttsOnGirHoles = playedHoles
    .filter((h) => h.gir === true)
    .reduce((a, h) => a + h.putts, 0);

  const fhHoles = playedHoles.filter((h) => h.fairwayHit != null);
  const fairwaysHit = fhHoles.filter((h) => h.fairwayHit).length;

  const scrambleMissedGir = playedHoles.filter((h) => h.gir === false);
  const scrambles = scrambleMissedGir.filter((h) => h.scramble).length;

  const sandOpp = playedHoles.filter((h) => h.bunkerHit);
  const sandSaves = sandOpp.filter((h) => h.sandSave).length;

  const driving = playedHoles
    .map((h) => h.drivingYards)
    .filter((y): y is number => y != null && y > 0);

  const planActual = playedHoles
    .map((h) => h.plannedVsActualAvg)
    .filter((d): d is number => d != null);

  return {
    startHole,
    holesPlayed: playedHoles.length,
    holesFinished: finishedHoles.length,
    totalScore,
    totalPar,
    toPar: totalScore - totalPar,
    totalPutts,
    puttsPerGir: girCount > 0 ? Math.round((puttsOnGirHoles / girCount) * 10) / 10 : null,
    fairwaysHit,
    fairwaysPossible: fhHoles.length,
    fairwayPct: pct(fairwaysHit, fhHoles.length),
    girCount,
    girPossible: playedHoles.length,
    girPct: pct(girCount, playedHoles.length),
    scrambles,
    scrambleOpportunities: scrambleMissedGir.length,
    scramblePct: pct(scrambles, scrambleMissedGir.length),
    sandSaves,
    sandSaveOpportunities: sandOpp.length,
    sandSavePct: pct(sandSaves, sandOpp.length),
    birdiesOrBetter: playedHoles.filter((h) => h.birdieOrBetter).length,
    onePutts: playedHoles.filter((h) => h.onePutt).length,
    avgDrivingYards: avg(driving),
    avgPlannedVsActual:
      planActual.length > 0
        ? Math.round(
            (planActual.reduce((a, b) => a + b, 0) / planActual.length) * 10
          ) / 10
        : null,
    strokeTotals: roundStrokeTotals(store, startHole),
    byHole,
  };
}

export function formatToPar(v: number | null): string {
  if (v == null) return "—";
  if (v === 0) return "E";
  return v > 0 ? `+${v}` : String(v);
}

export function formatPct(v: number | null): string {
  if (v == null) return "—";
  return `${v}%`;
}
