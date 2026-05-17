import type { SupabaseClient } from "@supabase/supabase-js";
import { listMisalignedCapturesForTournament } from "@/lib/scorecards/listMisalignedCaptures";
import { repairMisalignedCapturesForTournament } from "@/lib/scorecards/repairMisalignedCapturesForTournament";
import { repairMisalignedLocksForTournament } from "@/lib/scorecards/repairMisalignedLocksForTournament";
import { pruneMisalignedScorecardsForTournament } from "@/lib/scorecards/pruneMisalignedScorecardsForTournament";
import { repairInvalidLockedScorecardsForTournament } from "@/lib/scorecards/repairInvalidLockedScorecards";
import { restoreLocksOnCorrectRound } from "@/lib/scorecards/restoreLocksOnCorrectRound";
import type { RoundForEntryResolve } from "@/lib/rounds/resolveRoundForEntry";

export type FullAlignmentRepairResult = {
  misalignedBefore: number;
  captures: Awaited<ReturnType<typeof repairMisalignedCapturesForTournament>>;
  locks: Awaited<ReturnType<typeof repairMisalignedLocksForTournament>>;
  invalidLocks: Awaited<ReturnType<typeof repairInvalidLockedScorecardsForTournament>>;
  restoredLocksR1: Awaited<ReturnType<typeof restoreLocksOnCorrectRound>>;
  ghostScorecards: Awaited<ReturnType<typeof pruneMisalignedScorecardsForTournament>>;
  misalignedAfter: number;
};

/** Alinea capturas y limpia cierres en categoría equivocada (mismo torneo). */
export async function repairTournamentRoundAlignment(
  admin: SupabaseClient,
  tournamentId: string
): Promise<FullAlignmentRepairResult> {
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
  const misalignedBefore = (
    await listMisalignedCapturesForTournament(admin, tournamentId)
  ).length;

  const ghostScorecards = await pruneMisalignedScorecardsForTournament(
    admin,
    tournamentId
  );
  const invalidLocks = await repairInvalidLockedScorecardsForTournament(
    admin,
    tournamentId
  );
  const restoredLocksR1 = await restoreLocksOnCorrectRound(
    admin,
    tournamentId,
    1
  );
  const locks = await repairMisalignedLocksForTournament(
    admin,
    tournamentId,
    roundList
  );
  const captures = await repairMisalignedCapturesForTournament(
    admin,
    tournamentId
  );
  const misalignedAfter = (
    await listMisalignedCapturesForTournament(admin, tournamentId)
  ).length;

  return {
    misalignedBefore,
    captures,
    locks,
    invalidLocks,
    restoredLocksR1,
    ghostScorecards,
    misalignedAfter,
  };
}
