import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { stablefordPoints } from "@/lib/leaderboard/competitionScoring";
import {
  playingHandicap,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "@/lib/leaderboard/handicapStrokes";

export type TieBreakStep = {
  tie_break_profile_id?: string;
  step_no: number;
  method: string;
  basis: string;
  round_scope: string;
  hole_scope: string;
  handicap_mode: string;
  direction: string;
  value_text?: string | null;
};

function parseHoleScope(scope: string): number[] {
  const s = String(scope ?? "").trim();
  if (!s) return [];
  if (s === "18") {
    return Array.from({ length: 18 }, (_, i) => i + 1);
  }
  const range = s.match(/^(\d+)_(\d+)$/);
  if (range) {
    const a = Number(range[1]);
    const b = Number(range[2]);
    if (a <= b) {
      return Array.from({ length: b - a + 1 }, (_, i) => a + i);
    }
  }
  const n = Number(s);
  if (Number.isFinite(n) && n >= 1 && n <= 18) return [n];
  return [];
}

function usesPointsBasis(
  basis: string,
  catRule?: CategoryCompetitionRule
): boolean {
  const b = basis.toLowerCase();
  if (b === "points" || b === "stableford") return true;
  return catRule != null && isStablefordCategory(catRule);
}

/** Valor del segmento para desempate (gross, neto por hoyo o puntos Stableford). */
export function segmentStrokeTotal(
  detail: RoundDetail | null | undefined,
  holeScope: string,
  options?: {
    basis?: string;
    handicapMode?: string;
    catRule?: CategoryCompetitionRule;
    handicapIndex?: number | null;
    strokeIndexByHole?: StrokeIndexByHole;
  }
): number | null {
  if (!detail) return null;
  const holeNos = parseHoleScope(holeScope);
  if (holeNos.length === 0) return null;

  const basis = String(options?.basis ?? "gross").toLowerCase();
  const catRule = options?.catRule;
  const ph =
    catRule != null
      ? playingHandicap(
          options?.handicapIndex,
          catRule.handicap_percentage
        )
      : 0;

  if (usesPointsBasis(basis, catRule)) {
    let points = 0;
    let any = false;
    for (const holeNo of holeNos) {
      const hole = detail.holes.find((h) => h.hole_number === holeNo);
      if (hole?.strokes == null) continue;
      const strokes = Number(hole.strokes);
      const par = Number(hole.par ?? 0);
      if (Number.isNaN(strokes)) continue;
      const si = strokeIndexForHole(holeNo, options?.strokeIndexByHole);
      const received = strokesReceivedOnHole(ph, si);
      points += stablefordPoints(strokes - received, par);
      any = true;
    }
    return any ? points : null;
  }

  let total = 0;
  let any = false;
  for (const holeNo of holeNos) {
    const hole = detail.holes.find((h) => h.hole_number === holeNo);
    if (hole?.strokes == null) continue;
    const strokes = Number(hole.strokes);
    if (Number.isNaN(strokes)) continue;

    if (basis === "net" && catRule) {
      const mode = String(options?.handicapMode ?? "none").toLowerCase();
      if (mode !== "none") {
        const si = strokeIndexForHole(holeNo, options?.strokeIndexByHole);
        total += strokes - strokesReceivedOnHole(ph, si);
      } else {
        total += strokes;
      }
    } else {
      total += strokes;
    }
    any = true;
  }

  return any ? total : null;
}

function compareSegment(
  a: number | null,
  b: number | null,
  lowerIsBetter: boolean
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return lowerIsBetter ? a - b : b - a;
}

export function compareByTieBreakSteps(
  detailA: RoundDetail | null,
  detailB: RoundDetail | null,
  steps: TieBreakStep[],
  context?: {
    catRule?: CategoryCompetitionRule;
    handicapIndexA?: number | null;
    handicapIndexB?: number | null;
    strokeIndexByHole?: StrokeIndexByHole;
  }
): number {
  const ordered = [...steps].sort((x, y) => x.step_no - y.step_no);

  for (const step of ordered) {
    if (step.method !== "segment_compare") continue;

    const lower = step.direction === "lower_is_better";

    const opts = {
      basis: step.basis,
      handicapMode: step.handicap_mode,
      catRule: context?.catRule,
      strokeIndexByHole: context?.strokeIndexByHole,
    };
    const sa = segmentStrokeTotal(detailA, step.hole_scope, {
      ...opts,
      handicapIndex: context?.handicapIndexA,
    });
    const sb = segmentStrokeTotal(detailB, step.hole_scope, {
      ...opts,
      handicapIndex: context?.handicapIndexB,
    });

    const cmp = compareSegment(sa, sb, lower);
    if (cmp !== 0) return cmp;
  }

  return 0;
}
