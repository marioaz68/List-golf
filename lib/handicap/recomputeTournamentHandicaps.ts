import type { SupabaseClient } from "@supabase/supabase-js";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { resolveTournamentEntryHandicap } from "@/lib/handicap/resolveTournamentEntryHandicap";

export type RecomputeTournamentHandicapsResult = {
  total: number;
  updated: number;
  skipped_no_tee: number;
  kept_override: number;
};

/**
 * Recalcula CH/PH de todos los inscritos del torneo según:
 * categoría → salida (category_tee_rules) → WHS (slope/rating) → % competencia.
 */
export async function recomputeTournamentHandicaps(
  admin: SupabaseClient,
  tournamentId: string
): Promise<RecomputeTournamentHandicapsResult> {
  const ctx = await loadTournamentHandicapContext(admin, tournamentId);

  const { data: entries } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, category_id, handicap_index, playing_handicap_override, players:players(gender, birth_year, handicap_index, handicap_torneo)"
    )
    .eq("tournament_id", tournamentId)
    .neq("status", "cancelled");

  let updated = 0;
  let skipped_no_tee = 0;
  let kept_override = 0;
  const total = entries?.length ?? 0;

  for (const row of entries ?? []) {
    const e = row as {
      id: string;
      player_id: string;
      category_id: string | null;
      handicap_index: number | null;
      playing_handicap_override: number | null;
      players:
        | {
            gender: string | null;
            birth_year: number | null;
            handicap_index: number | null;
            handicap_torneo: number | null;
          }
        | Array<{
            gender: string | null;
            birth_year: number | null;
            handicap_index: number | null;
            handicap_torneo: number | null;
          }>
        | null;
    };

    const player = Array.isArray(e.players) ? e.players[0] : e.players;
    const entry = {
      id: e.id,
      player_id: e.player_id,
      category_id: e.category_id,
      handicap_index: e.handicap_index,
      playing_handicap_override: e.playing_handicap_override,
      player,
    };

    if (e.playing_handicap_override != null) kept_override++;

    const calc = resolveTournamentEntryHandicap(entry, ctx);
    if (!calc) {
      skipped_no_tee++;
      continue;
    }

    const finalPh =
      e.playing_handicap_override != null
        ? Math.round(Number(e.playing_handicap_override))
        : calc.playing_handicap;

    const { error } = await admin
      .from("tournament_entries")
      .update({
        course_handicap: calc.course_handicap,
        playing_handicap: finalPh,
        handicap_calc_meta: calc.meta,
      })
      .eq("id", e.id);

    if (!error) updated++;
  }

  return { total, updated, skipped_no_tee, kept_override };
}
