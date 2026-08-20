import type { SupabaseClient } from "@supabase/supabase-js";
import { isStartingOrderConfirmed } from "@/lib/tee-sheet/pairingGroupCategoryMatch";

const STARTING_ORDER_CONFIRMED_MARKER = "[LIST_GOLF_STARTING_ORDER_CONFIRMED]";

/** Marca la ronda como orden de salida confirmado (visible en tee sheet público). */
export async function confirmStartingOrderForRound(
  admin: SupabaseClient,
  roundId: string
): Promise<boolean> {
  const { data: row, error } = await admin
    .from("rounds")
    .select("notes")
    .eq("id", roundId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (isStartingOrderConfirmed(row?.notes)) return false;

  const notes = String(row?.notes ?? "").trim();
  const next = notes
    ? `${notes}\n${STARTING_ORDER_CONFIRMED_MARKER}`
    : STARTING_ORDER_CONFIRMED_MARKER;

  const { error: updErr } = await admin
    .from("rounds")
    .update({ notes: next })
    .eq("id", roundId);
  if (updErr) throw new Error(updErr.message);
  return true;
}

/** Publica salidas de match play: rondas con al menos un pairing_group. */
export async function publishMatchPlaySalidasForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<{ confirmed: number; roundIds: string[] }> {
  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (roundsErr) throw new Error(roundsErr.message);

  const roundIds = (rounds ?? []).map((r) => String(r.id)).filter(Boolean);
  if (roundIds.length === 0) return { confirmed: 0, roundIds: [] };

  const { data: groups, error: groupsErr } = await admin
    .from("pairing_groups")
    .select("round_id")
    .in("round_id", roundIds);
  if (groupsErr) throw new Error(groupsErr.message);

  const withGroups = [
    ...new Set(
      (groups ?? [])
        .map((g) => String(g.round_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  let confirmed = 0;
  for (const rid of withGroups) {
    if (await confirmStartingOrderForRound(admin, rid)) confirmed += 1;
  }

  return { confirmed, roundIds: withGroups };
}
