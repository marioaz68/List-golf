import type { SupabaseClient } from "@supabase/supabase-js";
import { autoPublishBracket } from "@/lib/matchplay/autoPublishBracket";
import { ensureMatchPlayCalendarRounds } from "@/lib/matchplay/ensureMatchPlayCalendarRounds";
import { seedDefinedMatchPlayGroups } from "@/lib/matchplay/seedDefinedMatchPlayGroups";

export type AutoPublishOnAuctionCompleteResult =
  | {
      status: "published";
      bracketId: string;
      message: string;
      roundsCreated: number;
      groupsCreated: number;
    }
  | {
      status: "bracket_exists";
      roundsCreated: number;
      groupsCreated: number;
    }
  | { status: "incomplete"; pending: number }
  | { status: "no_teams" }
  | { status: "skipped"; reason: string };

/**
 * Tras el último lote de la subasta:
 *  1. Publica el cuadro si aún no existe.
 *  2. Crea las rondas del calendario (R1…RN) si faltan.
 *  3. Genera foursomes de los matches ya definidos (R1 reales + R2 por BYE).
 *
 * No regenera un bracket existente ni borra salidas que el comité ya haya armado.
 */
export async function autoPublishOnAuctionComplete(
  admin: SupabaseClient,
  tournamentId: string
): Promise<AutoPublishOnAuctionCompleteResult> {
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

  const { data: existing } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
    .limit(1);

  let published:
    | { status: "published"; bracketId: string; message: string }
    | { status: "bracket_exists" };

  if (existing && existing.length > 0) {
    published = { status: "bracket_exists" };
  } else {
    const result = await autoPublishBracket(admin, tournamentId);
    if (!result.ok) {
      return { status: "skipped", reason: result.error };
    }
    published = {
      status: "published",
      bracketId: result.bracketId,
      message: result.message,
    };
  }

  const rounds = await ensureMatchPlayCalendarRounds(admin, tournamentId);
  const groups = await seedDefinedMatchPlayGroups(admin, tournamentId);

  if (published.status === "published") {
    const extras: string[] = [];
    if (rounds.created > 0) extras.push(`${rounds.created} ronda(s)`);
    if (groups.groupsCreated > 0) {
      extras.push(`${groups.groupsCreated} salida(s) desde el cuadro`);
    }
    return {
      ...published,
      message:
        extras.length > 0
          ? `${published.message} ${extras.join(" · ")}.`
          : published.message,
      roundsCreated: rounds.created,
      groupsCreated: groups.groupsCreated,
    };
  }

  return {
    status: "bracket_exists",
    roundsCreated: rounds.created,
    groupsCreated: groups.groupsCreated,
  };
}
