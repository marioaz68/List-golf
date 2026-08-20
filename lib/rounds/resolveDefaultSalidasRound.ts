import type { SupabaseClient } from "@supabase/supabase-js";

type RoundLite = { id: string; round_no: number | null };

/**
 * Ronda por defecto para pantallas de salidas (captura-telegram, etc.).
 * Prioriza la ronda explícita; si no, la primera (por round_no) con grupos;
 * si ninguna tiene grupos, la primera del calendario.
 */
export async function resolveDefaultSalidasRoundId(
  admin: SupabaseClient,
  rounds: RoundLite[],
  preferredRoundId?: string | null
): Promise<string | null> {
  if (rounds.length === 0) return null;

  const preferred = String(preferredRoundId ?? "").trim();
  if (preferred && rounds.some((r) => r.id === preferred)) {
    return preferred;
  }

  const roundIds = rounds.map((r) => r.id);
  const { data: groups } = await admin
    .from("pairing_groups")
    .select("round_id")
    .in("round_id", roundIds);

  const countByRound = new Map<string, number>();
  for (const g of groups ?? []) {
    const rid = String(g.round_id ?? "");
    if (!rid) continue;
    countByRound.set(rid, (countByRound.get(rid) ?? 0) + 1);
  }

  const ordered = [...rounds].sort(
    (a, b) => (a.round_no ?? 999) - (b.round_no ?? 999)
  );

  for (const r of ordered) {
    if ((countByRound.get(r.id) ?? 0) > 0) return r.id;
  }

  return ordered[0]?.id ?? null;
}
