import type { SupabaseClient } from "@supabase/supabase-js";

function holeNoFromRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

/** Hoyos distintos con score en `round_scores` de este jugador y ronda. */
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

export const MIN_HOLES_TO_LOCK_SCORECARD = 18;

export async function assertEighteenHolesBeforeLock(
  supabase: SupabaseClient,
  playerId: string,
  roundId: string
): Promise<void> {
  const holeCount = await countHolesOnPlayerRound(supabase, playerId, roundId);
  if (holeCount < MIN_HOLES_TO_LOCK_SCORECARD) {
    throw new Error(
      `No se puede cerrar la tarjeta: faltan hoyos (${holeCount}/${MIN_HOLES_TO_LOCK_SCORECARD}). Complete la captura antes de cerrar.`
    );
  }
}
