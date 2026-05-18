import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { scoreRoundDetail, type StrokeIndexByHole } from "./competitionScoring";

export type CutRankingBasis =
  | "gross_total"
  | "net_total"
  | "points_total"
  | "gross_round"
  | "net_round"
  | "points_round";

/** Acumulado en rondas [minRoundNo, maxRoundNo] (inclusive). */
export function cumulativeInRoundRange(
  details: RoundDetail[],
  rule: CategoryCompetitionRule,
  handicapIndex: number | null | undefined,
  minRoundNo: number,
  maxRoundNo: number,
  strokeIndexByHole?: StrokeIndexByHole
): {
  grossTotal: number | null;
  toParTotal: number | null;
  netToParTotal: number | null;
  stablefordTotal: number | null;
} {
  let totalGross = 0;
  let totalToPar = 0;
  let totalNetToPar = 0;
  let totalSf = 0;
  let hasGross = false;
  let hasToPar = false;
  let hasNet = false;
  let hasSf = false;

  const byRoundNo = new Map<number, RoundDetail>();
  for (const d of details) {
    if (d.is_dq) continue;
    if (d.round_no < minRoundNo || d.round_no > maxRoundNo) continue;
    if (!byRoundNo.has(d.round_no)) byRoundNo.set(d.round_no, d);
  }

  for (const detail of [...byRoundNo.values()].sort(
    (a, b) => a.round_no - b.round_no
  )) {
    const scored = scoreRoundDetail(
      detail,
      rule,
      handicapIndex,
      strokeIndexByHole
    );
    if (scored.gross != null) {
      totalGross += scored.gross;
      hasGross = true;
    }
    if (scored.toPar != null) {
      totalToPar += scored.toPar;
      hasToPar = true;
    }
    if (scored.netToPar != null) {
      totalNetToPar += scored.netToPar;
      hasNet = true;
    }
    if (scored.stablefordPoints != null) {
      totalSf += scored.stablefordPoints;
      hasSf = true;
    }
  }

  return {
    grossTotal: hasGross ? totalGross : null,
    toParTotal: hasToPar ? totalToPar : null,
    netToParTotal: hasNet ? totalNetToPar : null,
    stablefordTotal: hasSf ? totalSf : null,
  };
}

export function primaryFromRankingBasis(
  basis: CutRankingBasis,
  totals: ReturnType<typeof cumulativeInRoundRange>
): number | null {
  switch (basis) {
    case "points_total":
    case "points_round":
      return totals.stablefordTotal;
    case "net_total":
    case "net_round":
      return totals.netToParTotal;
    case "gross_total":
    case "gross_round":
      return totals.toParTotal ?? totals.grossTotal;
    default:
      return totals.toParTotal;
  }
}

export function higherIsBetterForRankingBasis(basis: CutRankingBasis): boolean {
  return basis === "points_total" || basis === "points_round";
}
