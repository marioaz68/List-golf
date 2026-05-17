import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getRoundForCategory,
  type RoundForGate,
} from "@/lib/rounds/categoryRoundGate";
import {
  isEntryRoundClosed,
  type LockedScorecardLookups,
} from "@/lib/leaderboard/lockedScorecards";

function holeNoFromRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

export async function countHolesOnPlayerRound(
  supabase: SupabaseClient,
  playerId: string,
  roundId: string
): Promise<number> {
  const { data: rs } = await supabase
    .from("round_scores")
    .select("id")
    .eq("player_id", playerId)
    .eq("round_id", roundId)
    .maybeSingle();

  if (!rs?.id) return 0;

  const { data: holes } = await supabase
    .from("hole_scores")
    .select("hole_number, hole_no")
    .eq("round_score_id", rs.id);

  const distinct = new Set<number>();
  for (const h of holes ?? []) {
    const n = holeNoFromRow(h);
    if (n != null) distinct.add(n);
  }
  return distinct.size;
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
      const closed = isEntryRoundClosed(
        params.entryId,
        forced,
        params.lookups
      );
      return {
        roundId: forced.id,
        roundNo: params.forceRoundNo,
        roundClosed: closed,
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
    roundClosed: true,
    pendingOpenRoundNo: params.captureRoundNo,
  };
}
