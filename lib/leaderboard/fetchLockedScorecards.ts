import type { SupabaseClient } from "@supabase/supabase-js";
import type { LockedScorecardRow } from "./lockedScorecards";

const POSTGREST_PAGE = 1000;

/** Tarjetas cerradas del torneo (paginado; evita truncar el leaderboard oficial). */
export async function fetchLockedScorecardsForTournament(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<LockedScorecardRow[]> {
  const collected: LockedScorecardRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("scorecards")
      .select("entry_id, round_id, locked_at")
      .eq("tournament_id", tournamentId)
      .not("locked_at", "is", null)
      .order("entry_id", { ascending: true })
      .order("round_id", { ascending: true })
      .range(from, from + POSTGREST_PAGE - 1);

    if (error) {
      throw new Error(`Error leyendo tarjetas cerradas: ${error.message}`);
    }

    const batch = (data ?? []) as LockedScorecardRow[];
    collected.push(...batch);

    if (batch.length < POSTGREST_PAGE) break;
    from += POSTGREST_PAGE;
    if (from > 200_000) break;
  }

  return collected;
}
