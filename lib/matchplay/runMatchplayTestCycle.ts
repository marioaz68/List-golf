import type { SupabaseClient } from "@supabase/supabase-js";
import { repairMatchplayFromR1 } from "@/lib/matchplay/repairMatchplayFromR1";
import { completeBracketToChampion } from "@/lib/matchplay/completeBracketToChampion";
import { advanceWinnerInBracket } from "@/lib/matchplay/advanceWinner";

export type RunTestCycleResult =
  | {
      ok: true;
      bracketId: string;
      r1ClosedFromScores: number;
      r1Simulated: number;
      championPairId: string;
      message: string;
    }
  | { ok: false; error: string };

/**
 * Ciclo de prueba: repara bracket desde R1, cierra R1 con scores reales
 * (o simula play-in), luego completa el cuadro hasta campeón.
 */
export async function runMatchplayTestCycle(
  admin: SupabaseClient,
  tournamentId: string
): Promise<RunTestCycleResult> {
  const repair = await repairMatchplayFromR1(admin, tournamentId);
  if (!repair.ok) return { ok: false, error: repair.error };

  const r1ClosedFromScores = repair.closedCount;
  let r1Simulated = 0;

  const { data: r1Pending } = await admin
    .from("matchplay_matches")
    .select("id, top_pair_id, bottom_pair_id, status")
    .eq("bracket_id", repair.bracketId)
    .eq("round_no", 1)
    .eq("status", "scheduled");

  for (const m of r1Pending ?? []) {
    if (!m.top_pair_id || !m.bottom_pair_id) continue;
    const winner = String(m.top_pair_id);
    await admin
      .from("matchplay_matches")
      .update({
        winner_pair_id: winner,
        status: "completed",
        result_text: "Prueba · play-in",
        holes_played: 18,
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    await advanceWinnerInBracket(admin, {
      match_id: String(m.id),
      winner_pair_id: winner,
    });
    r1Simulated += 1;
  }

  const done = await completeBracketToChampion(
    admin,
    tournamentId,
    repair.bracketId
  );
  if (!done.ok) return { ok: false, error: done.error };

  return {
    ok: true,
    bracketId: repair.bracketId,
    r1ClosedFromScores,
    r1Simulated,
    championPairId: done.championPairId,
    message:
      `Ciclo de prueba listo. R1: ${r1ClosedFromScores} con scores, ${r1Simulated} simulados. ` +
      done.message,
  };
}
