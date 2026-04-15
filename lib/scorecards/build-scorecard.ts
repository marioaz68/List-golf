import { buildHoles, calculateTotals } from "./helpers";
import type { BuildScorecardInput, ScorecardSummary } from "./types";

export function buildScorecardSummary(
  input: BuildScorecardInput
): ScorecardSummary {
  const holes = buildHoles(input);
  const totals = calculateTotals(holes);

  return {
    scorecard_id: input.scorecard_id,
    entry_id: input.entry_id,
    tournament_id: input.tournament_id ?? null,
    round_id: input.round_id,
    status: input.status ?? "draft",
    holes,
    totals,
    is_disqualified: input.is_disqualified ?? null,
    is_withdrawn: input.is_withdrawn ?? null,
    marker_signed_at: input.marker_signed_at ?? null,
    player_signed_at: input.player_signed_at ?? null,
    witness_signed_at: input.witness_signed_at ?? null,
    locked_at: input.locked_at ?? null,
  };
}