import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoleScoreRow, RoundScoreRow } from "./types";

const POSTGREST_PAGE = 1000;
const HOLE_SCORE_ID_CHUNK = 250;

/**
 * PostgREST suele devolver como máximo `max_rows` (típ. 1000). Sin paginar,
 * faltan `round_scores` y el detalle hoyo por hoyo queda vacío aunque la captura exista.
 */
export async function fetchRoundScoresForPublicLeaderboard(
  supabase: SupabaseClient,
  playerIds: string[],
  roundIds: string[]
): Promise<RoundScoreRow[]> {
  if (playerIds.length === 0 || roundIds.length === 0) return [];

  const collected: RoundScoreRow[] = [];
  let from = 0;

  for (;;) {
    const { data, error } = await supabase
      .from("round_scores")
      .select("id, round_id, player_id, gross_score")
      .in("player_id", playerIds)
      .in("round_id", roundIds)
      .order("id", { ascending: true })
      .range(from, from + POSTGREST_PAGE - 1);

    if (error) {
      throw new Error(`Error leyendo round_scores: ${error.message}`);
    }

    const batch = (data ?? []) as RoundScoreRow[];
    collected.push(...batch);

    if (batch.length < POSTGREST_PAGE) break;
    from += POSTGREST_PAGE;
  }

  return collected;
}

export async function fetchHoleScoresForRoundScores(
  supabase: SupabaseClient,
  roundScoreIds: string[]
): Promise<HoleScoreRow[]> {
  if (roundScoreIds.length === 0) return [];

  const collected: HoleScoreRow[] = [];

  for (let i = 0; i < roundScoreIds.length; i += HOLE_SCORE_ID_CHUNK) {
    const chunk = roundScoreIds.slice(i, i + HOLE_SCORE_ID_CHUNK);
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("hole_scores")
        .select("round_score_id, hole_number, hole_no, strokes")
        .in("round_score_id", chunk)
        .order("round_score_id", { ascending: true })
        .order("hole_number", { ascending: true, nullsFirst: false })
        .range(from, from + POSTGREST_PAGE - 1);

      if (error) {
        throw new Error(`Error leyendo hole_scores: ${error.message}`);
      }

      const batch = (data ?? []) as HoleScoreRow[];
      collected.push(...batch);

      if (batch.length < POSTGREST_PAGE) break;
      from += POSTGREST_PAGE;
    }
  }

  return collected;
}
