import type { SupabaseClient } from "@supabase/supabase-js";
import { listMisalignedLockedScorecardsForTournament } from "@/lib/scorecards/listMisalignedLockedScorecards";
import { syncCaptureToEntryRound } from "@/lib/scorecards/syncCaptureToEntryRound";
import type { RoundForEntryResolve } from "@/lib/rounds/resolveRoundForEntry";

export type RepairLocksResult = {
  repaired: number;
  skipped: number;
  errors: Array<{ player_number: number | null; message: string }>;
};

/**
 * Cierres en categoría equivocada: copia hoyos a la ronda del inscrito,
 * quita el cierre en la fila incorrecta y poda capturas duplicadas.
 */
export async function repairMisalignedLocksForTournament(
  admin: SupabaseClient,
  tournamentId: string,
  rounds: RoundForEntryResolve[]
): Promise<RepairLocksResult> {
  const rows = await listMisalignedLockedScorecardsForTournament(
    admin,
    tournamentId
  );
  const wrongLocks = rows.filter((r) => r.kind === "lock_wrong_category");

  const result: RepairLocksResult = {
    repaired: 0,
    skipped: 0,
    errors: [],
  };

  const seen = new Set<string>();

  for (const row of wrongLocks) {
    const key = `${row.entry_id}_${row.round_no}`;
    if (seen.has(key)) continue;
    seen.add(key);

    if (!row.locked_round_id) {
      result.skipped += 1;
      continue;
    }

    try {
      const { data: entryRow } = await admin
        .from("tournament_entries")
        .select("category_id")
        .eq("id", row.entry_id)
        .maybeSingle();

      await syncCaptureToEntryRound(admin, {
        tournamentId,
        entryId: row.entry_id,
        playerId: row.player_id,
        sessionRoundId: row.locked_round_id,
        entryCategoryId: entryRow?.category_id ?? null,
        rounds,
      });

      await admin
        .from("scorecards")
        .update({
          locked_at: null,
          status: "open",
        })
        .eq("entry_id", row.entry_id)
        .eq("round_id", row.locked_round_id);

      result.repaired += 1;
    } catch (e) {
      result.errors.push({
        player_number: row.player_number,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}
