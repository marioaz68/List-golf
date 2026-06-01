import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPublishBracket } from "@/lib/matchplay/autoPublishBracket";

/**
 * Si la subasta está completa (todos los equipos activos tienen
 * `auction_order` asignado) y aún NO existe un cuadro publicado para el
 * torneo, genera y publica el bracket automáticamente. De esta forma los
 * matches de la primera ronda quedan disponibles en `/torneos/[id]/matches-vivo`
 * y `/torneos/[id]/cuadro-vivo` sin que el comité tenga que entrar al
 * backoffice.
 *
 * Nunca borra ni regenera un bracket existente: si ya hay uno, devuelve
 * `{ status: 'bracket_exists' }`. Tampoco hace nada si quedan equipos sin
 * adjudicar.
 */
export async function autoPublishOnAuctionComplete(
  admin: SupabaseClient,
  tournamentId: string
): Promise<
  | { status: "published"; bracketId: string; message: string }
  | { status: "bracket_exists" }
  | { status: "incomplete"; pending: number }
  | { status: "no_teams" }
  | { status: "skipped"; reason: string }
> {
  const { data: existing } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1);
  if (existing && existing.length > 0) {
    return { status: "bracket_exists" };
  }

  const { data: teams } = await admin
    .from("matchplay_pair_teams")
    .select("id, auction_order")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  if (!teams || teams.length === 0) {
    return { status: "no_teams" };
  }

  const pending = teams.filter((t) => t.auction_order == null).length;
  if (pending > 0) {
    return { status: "incomplete", pending };
  }

  const result = await autoPublishBracket(admin, tournamentId);
  if (!result.ok) {
    return { status: "skipped", reason: result.error };
  }

  return {
    status: "published",
    bracketId: result.bracketId,
    message: result.message,
  };
}
