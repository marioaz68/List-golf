import type { SupabaseClient } from "@supabase/supabase-js";
import { syncPairingGroupTeeTimes } from "@/lib/matchplay/ensureMatchPlayCalendarRounds";

/** Renumera grupos de una ronda a 1..n sin huecos (orden actual por group_no). */
export async function compactPairingGroupNumbers(
  admin: SupabaseClient,
  roundId: string
): Promise<void> {
  const rid = String(roundId ?? "").trim();
  if (!rid) return;

  const { data: groups, error: gErr } = await admin
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", rid)
    .order("group_no", { ascending: true });

  if (gErr) throw new Error(gErr.message);
  const list = groups ?? [];
  if (list.length === 0) return;

  for (let i = 0; i < list.length; i++) {
    const desired = i + 1;
    const current = Number((list[i] as { group_no: number | null }).group_no);
    if (current === desired) continue;
    const { error } = await admin
      .from("pairing_groups")
      .update({ group_no: desired })
      .eq("id", (list[i] as { id: string }).id);
    if (error) throw new Error(error.message);
  }
}

/** Compacta group_no y recalcula tee_time según horario de la ronda. */
export async function compactAndSyncRoundGroups(
  admin: SupabaseClient,
  roundId: string
): Promise<void> {
  const rid = String(roundId ?? "").trim();
  if (!rid) return;

  await compactPairingGroupNumbers(admin, rid);

  const { data: roundRow } = await admin
    .from("rounds")
    .select("start_time, interval_minutes, start_type")
    .eq("id", rid)
    .maybeSingle();
  if (!roundRow) return;

  const start = roundRow.start_time ? String(roundRow.start_time) : "07:00";
  const interval =
    typeof roundRow.interval_minutes === "number" && roundRow.interval_minutes > 0
      ? Math.trunc(roundRow.interval_minutes)
      : 10;
  const startType =
    roundRow.start_type === "shotgun" ? "shotgun" : "tee_time";

  await syncPairingGroupTeeTimes(admin, rid, start, interval, startType);
}
