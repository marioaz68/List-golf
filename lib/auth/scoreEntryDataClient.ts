import { createAdminClient, createClient } from "@/utils/supabase/server";
import {
  checkTournamentAccess,
  requireTournamentAccess,
  type TournamentAccessResult,
} from "@/lib/auth/requireTournamentAccess";
import { SCORE_CAPTURE_TOURNAMENT_ROLES } from "@/lib/auth/scoreCaptureAccess";

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Cliente Supabase para lecturas de /score-entry tras validar acceso al torneo.
 * Usa service role para evitar que RLS bloquee a marshals y capturistas.
 */
export async function createScoreEntryDataClient(
  tournamentId: string
): Promise<ServerSupabase> {
  await requireTournamentAccess({
    tournamentId,
    allowedRoles: SCORE_CAPTURE_TOURNAMENT_ROLES,
  });
  return createAdminClient();
}

export async function checkScoreEntryTournamentAccess(
  tournamentId: string
): Promise<TournamentAccessResult> {
  return checkTournamentAccess({
    tournamentId,
    allowedRoles: SCORE_CAPTURE_TOURNAMENT_ROLES,
  });
}
