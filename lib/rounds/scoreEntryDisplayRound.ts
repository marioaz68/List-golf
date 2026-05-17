import type { SupabaseClient } from "@supabase/supabase-js";
import { countHolesOnPlayerRound } from "@/lib/scorecards/countHolesOnPlayerRound";
import {
  getRoundForCategory,
  type RoundForGate,
} from "@/lib/rounds/categoryRoundGate";
import {
  isEntryRoundClosed,
  type LockedScorecardLookups,
} from "@/lib/leaderboard/lockedScorecards";

export { countHolesOnPlayerRound };

export type ScoreEntryCaptureTarget = {
  roundId: string;
  roundNo: number;
  roundClosed: boolean;
  /** Ronda abierta siguiente (sin hoyos) cuando se muestra la cerrada anterior. */
  pendingOpenRoundNo?: number;
};

/**
 * Tras resolver la ronda «abierta» lógica: si es R2+ sin hoyos y la anterior está
 * cerrada, mostrar la cerrada con ABRIR (p. ej. #350 con R1 cerrada y R2 vacía).
 */
export async function resolveScoreEntryDisplayTarget(
  supabase: SupabaseClient,
  params: {
    entryId: string;
    playerId: string;
    categoryId: string | null;
    rounds: RoundForGate[];
    lookups: LockedScorecardLookups;
    captureRoundId: string;
    captureRoundNo: number;
    captureRoundClosed: boolean;
    /** Si el operador pide una ronda concreta (?round_no=2). */
    forceRoundNo?: number | null;
  }
): Promise<ScoreEntryCaptureTarget> {
  const cat = String(params.categoryId ?? "").trim();
  const rounds = params.rounds;

  if (
    params.forceRoundNo != null &&
    Number.isFinite(params.forceRoundNo) &&
    params.forceRoundNo >= 1
  ) {
    const forced = getRoundForCategory(
      rounds,
      params.forceRoundNo,
      cat || null
    );
    if (forced) {
      let closed = isEntryRoundClosed(
        params.entryId,
        forced,
        params.lookups
      );
      if (closed) {
        const holes = await countHolesOnPlayerRound(
          supabase,
          params.playerId,
          forced.id
        );
        closed = holes >= 18;
      }
      return {
        roundId: forced.id,
        roundNo: params.forceRoundNo,
        roundClosed: closed,
      };
    }
  }

  if (params.captureRoundClosed) {
    const holes = await countHolesOnPlayerRound(
      supabase,
      params.playerId,
      params.captureRoundId
    );
    return {
      roundId: params.captureRoundId,
      roundNo: params.captureRoundNo,
      roundClosed: holes >= 18,
    };
  }

  if (params.captureRoundNo <= 1) {
    return {
      roundId: params.captureRoundId,
      roundNo: params.captureRoundNo,
      roundClosed: false,
    };
  }

  const prior = getRoundForCategory(
    rounds,
    params.captureRoundNo - 1,
    cat || null
  );

  if (
    !prior?.id ||
    !isEntryRoundClosed(params.entryId, prior, params.lookups)
  ) {
    return {
      roundId: params.captureRoundId,
      roundNo: params.captureRoundNo,
      roundClosed: false,
    };
  }

  const holesOnOpen = await countHolesOnPlayerRound(
    supabase,
    params.playerId,
    params.captureRoundId
  );

  if (holesOnOpen > 0) {
    return {
      roundId: params.captureRoundId,
      roundNo: params.captureRoundNo,
      roundClosed: false,
    };
  }

  const priorHoles = await countHolesOnPlayerRound(
    supabase,
    params.playerId,
    prior.id
  );

  return {
    roundId: prior.id,
    roundNo: prior.round_no,
    roundClosed: priorHoles >= 18,
    pendingOpenRoundNo: params.captureRoundNo,
  };
}
