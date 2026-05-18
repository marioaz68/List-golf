import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { isStablefordCategory } from "./categoryCompetitionRules";
import { stablefordPoints } from "./competitionScoring";
import {
  playingHandicap,
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "./handicapStrokes";

export type PerHoleCompetitionCell = {
  holeNumber: number;
  par: number | null;
  grossStrokes: number | null;
  strokeIndex: number;
  strokesReceived: number;
  netStrokes: number | null;
  stablefordPoints: number | null;
};

export function perHoleCompetitionBreakdown(
  detail: RoundDetail,
  rule: CategoryCompetitionRule,
  handicapIndex: number | null | undefined,
  strokeIndexByHole?: StrokeIndexByHole
): PerHoleCompetitionCell[] {
  const ph = playingHandicap(handicapIndex, rule.handicap_percentage);
  const useStableford = isStablefordCategory(rule);
  const useNet =
    useStableford ||
    rule.leaderboard_basis === "net" ||
    rule.leaderboard_basis === "both";

  return detail.holes.map((hole) => {
    const holeNumber = hole.hole_number;
    const par = hole.par != null ? Number(hole.par) : null;
    const gross =
      hole.strokes != null && !Number.isNaN(Number(hole.strokes))
        ? Number(hole.strokes)
        : null;
    const si = strokeIndexForHole(holeNumber, strokeIndexByHole);
    const received =
      gross != null && useNet ? strokesReceivedOnHole(ph, si) : 0;
    const net =
      gross != null && useNet ? gross - received : gross != null ? gross : null;
    const pts =
      net != null && par != null && useStableford
        ? stablefordPoints(net, par)
        : null;

    return {
      holeNumber,
      par,
      grossStrokes: gross,
      strokeIndex: si,
      strokesReceived: received,
      netStrokes: net,
      stablefordPoints: pts,
    };
  });
}

export function formatPlayingHandicapSummary(
  handicapIndex: number | null | undefined,
  handicapPercentage: number
): string {
  const idx =
    handicapIndex != null && Number.isFinite(handicapIndex)
      ? handicapIndex
      : null;
  const ph = playingHandicap(handicapIndex, handicapPercentage);
  if (idx == null) return `PH ${ph}`;
  return `HCP ${idx} · PH ${ph} (${handicapPercentage}%)`;
}
