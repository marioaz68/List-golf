import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundForGate } from "@/lib/rounds/categoryRoundGate";

export type PruneMisalignedScorecardsResult = {
  entriesProcessed: number;
  scorecardsRemoved: number;
  roundScoresPruned: number;
  playersAffected: number;
  errors: string[];
};

const PAGE = 500;

/**
 * Elimina tarjetas (`scorecards`) en filas `rounds` cuya categoría no coincide
 * con la inscripción. No toca capturas ni tarjetas en la categoría correcta.
 */
export async function pruneMisalignedScorecardsForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<PruneMisalignedScorecardsResult> {
  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id, round_no, category_id")
    .eq("tournament_id", tournamentId);

  if (roundsErr) {
    throw new Error(`Error leyendo rondas: ${roundsErr.message}`);
  }

  const roundList = (rounds ?? []) as RoundForGate[];

  const { count: entryCount, error: countErr } = await admin
    .from("tournament_entries")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  if (countErr) {
    throw new Error(`Error contando inscripciones: ${countErr.message}`);
  }

  const result: PruneMisalignedScorecardsResult = {
    entriesProcessed: entryCount ?? 0,
    scorecardsRemoved: 0,
    roundScoresPruned: 0,
    playersAffected: 0,
    errors: [],
  };

  for (const round of roundList) {
    const roundId = String(round.id);
    const roundCat = String(round.category_id ?? "").trim();
    if (!roundCat) continue;

    let from = 0;
    for (;;) {
      const { data: wrongEntries, error: entErr } = await admin
        .from("tournament_entries")
        .select("id")
        .eq("tournament_id", tournamentId)
        .neq("category_id", roundCat)
        .not("category_id", "is", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);

      if (entErr) {
        result.errors.push(`round ${roundId}: ${entErr.message}`);
        break;
      }

      const batch = (wrongEntries ?? []).map((e) => String(e.id));
      if (batch.length === 0) break;

      const { count, error: delErr } = await admin
        .from("scorecards")
        .delete({ count: "exact" })
        .eq("round_id", roundId)
        .in("entry_id", batch);

      if (delErr) {
        result.errors.push(`delete round ${roundId}: ${delErr.message}`);
        break;
      }

      result.scorecardsRemoved += count ?? 0;
      if (batch.length < PAGE) break;
      from += PAGE;
    }
  }

  return result;
}
