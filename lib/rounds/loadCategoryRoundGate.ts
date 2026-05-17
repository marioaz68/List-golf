import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchLockedScorecardsForTournament } from "@/lib/leaderboard/fetchLockedScorecards";
import {
  buildLockedScorecardLookups,
  type LockedScorecardLookups,
} from "@/lib/leaderboard/lockedScorecards";
import {
  getPriorRoundGate,
  type RoundForGate,
  type TournamentEntryForGate,
} from "@/lib/rounds/categoryRoundGate";

export type CategoryRoundGateContext = {
  entries: TournamentEntryForGate[];
  rounds: RoundForGate[];
  lookups: LockedScorecardLookups;
};

export async function loadCategoryRoundGateContext(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<CategoryRoundGateContext> {
  const [entriesRes, roundsRes] = await Promise.all([
    supabase
      .from("tournament_entries")
      .select("id, category_id, status")
      .eq("tournament_id", tournamentId),
    supabase
      .from("rounds")
      .select("id, round_no, category_id")
      .eq("tournament_id", tournamentId),
  ]);

  if (entriesRes.error) {
    throw new Error(`Error leyendo inscripciones: ${entriesRes.error.message}`);
  }
  if (roundsRes.error) {
    throw new Error(`Error leyendo rondas: ${roundsRes.error.message}`);
  }

  const scorecardsData = await fetchLockedScorecardsForTournament(
    supabase,
    tournamentId
  );

  const entries = (entriesRes.data ?? []) as TournamentEntryForGate[];
  const rounds = ((roundsRes.data ?? []) as Array<{
    id: string;
    round_no: number;
    category_id?: string | null;
  }>).map((r) => ({
    id: r.id,
    round_no: Number(r.round_no),
    category_id: r.category_id ?? null,
  }));

  const lookups = buildLockedScorecardLookups(
    scorecardsData as Array<{
      entry_id: string;
      round_id: string;
      locked_at: string | null;
    }>,
    rounds.map((r) => ({ id: r.id, round_no: r.round_no }))
  );

  return { entries, rounds, lookups };
}

export function priorRoundGateForEntry(
  ctx: CategoryRoundGateContext,
  targetRoundNo: number,
  categoryId: string | null
) {
  return getPriorRoundGate(
    ctx.entries,
    ctx.rounds,
    targetRoundNo,
    categoryId,
    ctx.lookups
  );
}
