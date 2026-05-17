import type { SupabaseClient } from "@supabase/supabase-js";
import { alignCaptureToScorecardRound } from "@/lib/scorecards/alignCaptureToScorecardRound";
import { pruneMisalignedRoundCaptures } from "@/lib/scorecards/pruneMisalignedRoundCaptures";
import {
  resolveEntryCategoryRoundId,
  type RoundForEntryResolve,
} from "@/lib/rounds/resolveRoundForEntry";

/**
 * Alinea captura + tarjeta a la ronda de la categoría del inscrito y elimina
 * duplicados del mismo round_no en otras categorías.
 */
export async function syncCaptureToEntryRound(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    entryId: string;
    playerId: string;
    sessionRoundId: string;
    entryCategoryId: string | null;
    rounds: RoundForEntryResolve[];
  }
): Promise<{
  targetRoundId: string;
  aligned: boolean;
  holesCopied: number;
  prunedRoundScoreIds: string[];
}> {
  const targetRoundId = resolveEntryCategoryRoundId(
    params.rounds,
    params.sessionRoundId,
    params.entryCategoryId
  );

  const targetRound = params.rounds.find((r) => r.id === targetRoundId);
  const roundNo = Number(targetRound?.round_no ?? 0);

  const alignResult = await alignCaptureToScorecardRound(admin, {
    tournamentId: params.tournamentId,
    entryId: params.entryId,
    playerId: params.playerId,
    scorecardRoundId: targetRoundId,
  });

  let prunedRoundScoreIds: string[] = [];
  if (roundNo > 0) {
    const pruneResult = await pruneMisalignedRoundCaptures(admin, {
      tournamentId: params.tournamentId,
      playerId: params.playerId,
      entryId: params.entryId,
      keepRoundId: targetRoundId,
      roundNo,
    });
    prunedRoundScoreIds = pruneResult.prunedRoundScoreIds;
  }

  return {
    targetRoundId,
    aligned: alignResult.aligned,
    holesCopied: alignResult.holesCopied,
    prunedRoundScoreIds,
  };
}
