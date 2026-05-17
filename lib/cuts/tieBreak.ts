import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import { scoreRoundDetail } from "@/lib/leaderboard/competitionScoring";

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
  if (s === "18") return [18];
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

function segmentParPlayed(detail: RoundDetail, holeNos: number[]): number {
  let par = 0;
  for (const holeNo of holeNos) {
    const hole = detail.holes.find((h) => h.hole_number === holeNo);
    if (hole?.strokes == null) continue;
    par += Number(hole.par ?? 0);
  }
  return par;
}

/** Suma de golpes o neto en el segmento (solo hoyos jugados). */
export function segmentStrokeTotal(
  detail: RoundDetail | null | undefined,
  holeScope: string,
  options?: {
    basis?: string;
    handicapMode?: string;
    catRule?: CategoryCompetitionRule;
    handicapIndex?: number | null;
  }
): number | null {
  if (!detail) return null;
  const holeNos = parseHoleScope(holeScope);
  if (holeNos.length === 0) return null;

  let total = 0;
  let any = false;
  for (const holeNo of holeNos) {
    const hole = detail.holes.find((h) => h.hole_number === holeNo);
    if (hole?.strokes == null) continue;
    const s = Number(hole.strokes);
    if (Number.isNaN(s)) continue;
    total += s;
    any = true;
  }
  if (!any) return null;

  const basis = String(options?.basis ?? "gross").toLowerCase();
  if (basis !== "net" || !options?.catRule) {
    return total;
  }

  const scored = scoreRoundDetail(detail, options.catRule, options.handicapIndex);
  if (scored.netToPar == null || scored.toPar == null) {
    return total;
  }

  const segmentPar = segmentParPlayed(detail, holeNos);
  const fullPar = detail.holes.reduce(
    (acc, h) => acc + (h.strokes != null ? Number(h.par ?? 0) : 0),
    0
  );
  if (fullPar <= 0) return total;

  const ph = scored.toPar - (scored.netToPar ?? scored.toPar);
  const mode = String(options.handicapMode ?? "none").toLowerCase();
  if (mode === "none") {
    return total;
  }

  const strokesOff = Math.round((ph * segmentPar) / fullPar);
  return total - strokesOff;
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
