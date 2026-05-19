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

/**
 * Ronda concreta elegida por el operador (?round_no=N): categoría de inscripción
 * y, si hace falta, la fila `rounds` donde ya hay captura (p. ej. mal alineada).
 */
export async function resolveForcedScoreEntryRound(
  supabase: SupabaseClient,
  params: {
    entryId: string;
    playerId: string;
    categoryId: string | null;
    rounds: RoundForGate[];
    lookups: LockedScorecardLookups;
    forceRoundNo: number;
    tournamentRoundIds: string[];
  }
): Promise<ScoreEntryCaptureTarget | null> {
  const cat = String(params.categoryId ?? "").trim();
  const roundIdsForNo = params.rounds
    .filter((r) => r.round_no === params.forceRoundNo)
    .map((r) => r.id);

  let round = getRoundForCategory(
    params.rounds,
    params.forceRoundNo,
    cat || null
  );

  const scoreScope =
    roundIdsForNo.length > 0 ? roundIdsForNo : params.tournamentRoundIds;
  if (scoreScope.length > 0) {
    const { data: scoreRows } = await supabase
      .from("round_scores")
      .select("round_id")
      .eq("player_id", params.playerId)
      .in("round_id", scoreScope);

    const scoredIds = (scoreRows ?? [])
      .map((r) => String(r.round_id ?? "").trim())
      .filter(Boolean);

    if (scoredIds.length > 0) {
      const preferred =
        scoredIds.find((id) => {
          const meta = params.rounds.find((r) => r.id === id);
          if (!meta) return false;
          if (!cat) return true;
          const metaCat = String(meta.category_id ?? "").trim();
          return metaCat === cat || !metaCat;
        }) ?? scoredIds[0];
      const fromScore = params.rounds.find((r) => r.id === preferred);
      if (fromScore) round = fromScore;
    }
  }

  if (!round?.id) return null;

  return {
    roundId: round.id,
    roundNo: params.forceRoundNo,
    roundClosed: isEntryRoundClosed(params.entryId, round, params.lookups),
  };
}

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
      return {
        roundId: forced.id,
        roundNo: params.forceRoundNo,
        roundClosed: isEntryRoundClosed(
          params.entryId,
          forced,
          params.lookups
        ),
      };
    }
  }

  if (params.captureRoundClosed) {
    return {
      roundId: params.captureRoundId,
      roundNo: params.captureRoundNo,
      roundClosed: true,
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

  return {
    roundId: prior.id,
    roundNo: prior.round_no,
    roundClosed: isEntryRoundClosed(
      params.entryId,
      prior,
      params.lookups
    ),
    pendingOpenRoundNo: params.captureRoundNo,
  };
}
