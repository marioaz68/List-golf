import type { SupabaseClient } from "@supabase/supabase-js";

export function normalizePersonName(s: string): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(mr|mrs|ms|sr|sra)\.?\b/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalizePersonName(s)
    .split(" ")
    .filter((t) => t.length >= 2);
}

function scoreName(golferName: string, first: string, last: string): number {
  const got = new Set(tokens(golferName));
  const firstToks = tokens(first);
  const lastToks = tokens(last);
  if (firstToks.length === 0 || lastToks.length === 0) return 0;
  const firstHit = firstToks.some((t) => got.has(t));
  const lastHits = lastToks.filter((t) => got.has(t)).length;
  if (!firstHit || lastHits === 0) return 0;
  return lastHits * 10 + firstToks.filter((t) => got.has(t)).length;
}

/**
 * Busca el GHIN en el histórico del club por nombre (las gráficas usan
 * golfer_name, no el campo players.ghin_number).
 */
export async function lookupGhinByPlayerName(
  admin: SupabaseClient,
  firstName: string | null | undefined,
  lastName: string | null | undefined
): Promise<string | null> {
  const first = String(firstName ?? "").trim();
  const last = String(lastName ?? "").trim();
  if (!first || !last) return null;

  const lastToks = tokens(last);
  const firstToks = tokens(first);
  const needle = lastToks[0] ?? firstToks[0];
  if (!needle || needle.length < 3) return null;

  const { data, error } = await admin
    .from("ghin_index_revisions")
    .select("ghin_number, golfer_name")
    .ilike("golfer_name", `%${needle}%`)
    .limit(400);
  if (error || !data?.length) return null;

  const best = new Map<string, { score: number; name: string }>();
  for (const row of data) {
    const ghin = String((row as { ghin_number?: string }).ghin_number ?? "").trim();
    const name = String((row as { golfer_name?: string }).golfer_name ?? "");
    if (!ghin) continue;
    const s = scoreName(name, first, last);
    if (s <= 0) continue;
    const prev = best.get(ghin);
    if (!prev || s > prev.score) best.set(ghin, { score: s, name });
  }
  if (best.size === 0) return null;

  const ranked = [...best.entries()].sort((a, b) => b[1].score - a[1].score);
  const top = ranked[0];
  if (!top) return null;
  const second = ranked[1];
  if (second && second[1].score === top[1].score) return null;
  return top[0];
}

export async function attachGhinToPlayerIfMissing(
  admin: SupabaseClient,
  playerId: string,
  ghin: string
): Promise<void> {
  const id = String(playerId ?? "").trim();
  const num = String(ghin ?? "").trim();
  if (!id || !num) return;
  await admin
    .from("players")
    .update({ ghin_number: num })
    .eq("id", id)
    .is("ghin_number", null);
}
