import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyNextRoundGroupCreated } from "@/lib/matchplay/notifyNextRoundGroup";

function normTee(raw: string | null | undefined): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  return t.slice(0, 5);
}

/**
 * Si el tee_time de un grupo cambió, avisa por Telegram a jugadores/caddies
 * con mensaje de “ajuste de salida” (reemplaza el next_round_group previo).
 * Best-effort: no lanza.
 */
export async function notifyIfGroupTeeTimeChanged(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    roundId: string;
    groupId: string;
    previousTeeTime: string | null | undefined;
    nextTeeTime: string | null | undefined;
  }
): Promise<void> {
  const prev = normTee(args.previousTeeTime);
  const next = normTee(args.nextTeeTime);
  if (!next || prev === next) return;

  try {
    await notifyNextRoundGroupCreated(admin, {
      tournamentId: args.tournamentId,
      nextRoundId: args.roundId,
      nextGroupId: args.groupId,
      reason: "tee_adjusted",
      previousTeeTime: prev,
    });
  } catch (err) {
    console.error("[notifyIfGroupTeeTimeChanged]", err);
  }
}
