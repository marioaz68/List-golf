import type { SupabaseClient } from "@supabase/supabase-js";
import { listMisalignedCapturesForTournament } from "@/lib/scorecards/listMisalignedCaptures";
import { syncCaptureToEntryRound } from "@/lib/scorecards/syncCaptureToEntryRound";
import type { RoundForEntryResolve } from "@/lib/rounds/resolveRoundForEntry";

export type RepairCaptureResult = {
  repaired: number;
  skipped: number;
  errors: Array<{ player_number: number | null; message: string }>;
  details: Array<{
    player_number: number | null;
    from: string | null;
    to: string | null;
    holesCopied: number;
    pruned: number;
  }>;
};

/**
 * Mueve capturas a la fila `rounds` de la categoría del inscrito.
 * No altera los números de los hoyos: solo la ubicación.
 */
export async function repairMisalignedCapturesForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<RepairCaptureResult> {
  const misaligned = await listMisalignedCapturesForTournament(
    admin,
    tournamentId
  );

  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select(
      "id, tournament_id, category_id, round_no, round_date, start_type, start_time, wave"
    )
    .eq("tournament_id", tournamentId);

  if (roundsErr) {
    throw new Error(`Error leyendo rondas: ${roundsErr.message}`);
  }

  const roundList = (rounds ?? []) as RoundForEntryResolve[];

  const result: RepairCaptureResult = {
    repaired: 0,
    skipped: 0,
    errors: [],
    details: [],
  };

  for (const row of misaligned) {
    try {
      const { data: entryRow } = await admin
        .from("tournament_entries")
        .select("category_id")
        .eq("id", row.entry_id)
        .maybeSingle();

      const sync = await syncCaptureToEntryRound(admin, {
        tournamentId,
        entryId: row.entry_id,
        playerId: row.player_id,
        sessionRoundId: row.wrong_round_id,
        entryCategoryId: entryRow?.category_id ?? null,
        rounds: roundList,
      });

      if (sync.holesCopied > 0 || sync.prunedRoundScoreIds.length > 0) {
        result.repaired += 1;
        result.details.push({
          player_number: row.player_number,
          from: row.wrong_round_category_code,
          to: row.expected_round_category_code,
          holesCopied: sync.holesCopied,
          pruned: sync.prunedRoundScoreIds.length,
        });
      } else {
        result.skipped += 1;
      }
    } catch (e) {
      result.errors.push({
        player_number: row.player_number,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
