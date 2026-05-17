import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Borra capturas del mismo round_no en **otras** categorías para este jugador/inscripción.
 * Evita duplicados visuales (p. ej. R1 en DA + R1 en A) cuando la inscripción ya guardó en la ronda correcta.
 */
export async function pruneMisalignedRoundCaptures(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    playerId: string;
    entryId: string;
    /** round_id que se acaba de guardar (se conserva) */
    keepRoundId: string;
    roundNo: number;
  }
): Promise<{ prunedRoundScoreIds: string[] }> {
  const { tournamentId, playerId, entryId, keepRoundId, roundNo } = params;

  const { data: entryRow, error: entryErr } = await admin
    .from("tournament_entries")
    .select("category_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryErr || !entryRow) {
    return { prunedRoundScoreIds: [] };
  }

  const entryCat = String(entryRow.category_id ?? "").trim();
  if (!entryCat) {
    return { prunedRoundScoreIds: [] };
  }

  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id, category_id")
    .eq("tournament_id", tournamentId)
    .eq("round_no", roundNo);

  if (roundsErr || !rounds?.length) {
    return { prunedRoundScoreIds: [] };
  }

  const strayRoundIds = rounds
    .filter((r) => {
      if (String(r.id) === keepRoundId) return false;
      const rc = String(r.category_id ?? "").trim();
      if (!rc) return false;
      return rc !== entryCat;
    })
    .map((r) => r.id);

  const prunedRoundScoreIds: string[] = [];

  for (const rid of strayRoundIds) {
    const { data: rs } = await admin
      .from("round_scores")
      .select("id")
      .eq("player_id", playerId)
      .eq("round_id", rid)
      .maybeSingle();

    if (!rs?.id) continue;

    await admin.from("hole_scores").delete().eq("round_score_id", rs.id);
    await admin
      .from("scorecards")
      .delete()
      .eq("entry_id", entryId)
      .eq("round_id", rid);
    await admin.from("round_scores").delete().eq("id", rs.id);
    prunedRoundScoreIds.push(rs.id);
  }

  return { prunedRoundScoreIds };
}
