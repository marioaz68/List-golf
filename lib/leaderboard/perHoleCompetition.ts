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

export type EntryHandicapCardInput = {
  handicap_index?: number | null;
  course_handicap?: number | null;
  playing_handicap?: number | null;
  playing_handicap_override?: number | null;
};

function fmtHi(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/** Carnet del jugador: HI (variable) + HC/PH fijos del torneo/campo. */
export function formatEntryHandicapCard(
  h: EntryHandicapCardInput
): string | null {
  const hi =
    h.handicap_index != null && Number.isFinite(Number(h.handicap_index))
      ? Number(h.handicap_index)
      : null;
  const ch =
    h.course_handicap != null && Number.isFinite(Number(h.course_handicap))
      ? Math.round(Number(h.course_handicap))
      : null;
  const ph =
    h.playing_handicap != null && Number.isFinite(Number(h.playing_handicap))
      ? Math.round(Number(h.playing_handicap))
      : null;

  if (hi == null && ch == null && ph == null) return null;

  const parts: string[] = [];
  if (hi != null) parts.push(`HI ${fmtHi(hi)}`);
  if (ch != null) parts.push(`HC ${ch}`);
  if (ph != null) {
    parts.push(
      `PH ${ph}${h.playing_handicap_override != null ? " (manual)" : ""}`
    );
  }
  return parts.join(" · ");
}

export function entryHandicapCardFromRow(
  row: EntryHandicapCardInput & { player_id?: string },
  handicapIndexFallback?: number | null
): string | null {
  return formatEntryHandicapCard({
    handicap_index: row.handicap_index ?? handicapIndexFallback ?? null,
    course_handicap: row.course_handicap,
    playing_handicap: row.playing_handicap,
    playing_handicap_override: row.playing_handicap_override,
  });
}
