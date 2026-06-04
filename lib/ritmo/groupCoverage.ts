import type { SupabaseClient } from "@supabase/supabase-js";

export type CaddieCoverage = {
  name: string;
  hasTelegram: boolean;
};

export type GroupCoverageInfo = {
  caddies: CaddieCoverage[];
  playersWithTelegram: number;
  playerCount: number;
};

export type GroupGpsState = "live" | "stale" | "none";

/** Última posición por grupo en la ventana de lookback. */
export async function loadLatestGpsByGroup(
  supabase: SupabaseClient,
  tournamentId: string,
  roundId: string,
  groupIds: string[],
  lookbackMinutes = 90
): Promise<Map<string, { ts: string }>> {
  const out = new Map<string, { ts: string }>();
  if (groupIds.length === 0) return out;

  const cutoff = new Date(
    Date.now() - lookbackMinutes * 60 * 1000
  ).toISOString();

  const { data } = await supabase
    .from("ritmo_positions")
    .select("group_id, ts")
    .eq("tournament_id", tournamentId)
    .eq("round_id", roundId)
    .in("group_id", groupIds)
    .gte("ts", cutoff)
    .order("ts", { ascending: false });

  for (const row of data ?? []) {
    const gid = String(row.group_id ?? "");
    if (!gid || out.has(gid)) continue;
    out.set(gid, { ts: String(row.ts) });
  }
  return out;
}

export function gpsStateFromTimestamp(
  lastTs: string | null | undefined,
  staleMinutes = 12,
  now = new Date()
): GroupGpsState {
  if (!lastTs) return "none";
  const ageMs = now.getTime() - new Date(lastTs).getTime();
  if (ageMs > staleMinutes * 60 * 1000) return "stale";
  return "live";
}

/** Caddie activo por inscrito (entry) en una ronda, con su estado de Telegram. */
export async function loadCaddieByEntry(
  supabase: SupabaseClient,
  tournamentId: string,
  roundId: string,
  entryIds: string[]
): Promise<Map<string, CaddieCoverage>> {
  const caddieByEntry = new Map<string, CaddieCoverage>();
  if (entryIds.length === 0) return caddieByEntry;

  const { data: caRaw } = await supabase
    .from("caddie_assignments")
    .select(
      `entry_id,
       caddies ( first_name, last_name, telegram )`
    )
    .eq("tournament_id", tournamentId)
    .eq("round_id", roundId)
    .eq("is_active", true)
    .in("entry_id", entryIds);

  type CaRow = {
    entry_id: string;
    caddies:
      | { first_name: string | null; last_name: string | null; telegram: string | null }
      | { first_name: string | null; last_name: string | null; telegram: string | null }[]
      | null;
  };
  for (const row of (caRaw ?? []) as unknown as CaRow[]) {
    const c = Array.isArray(row.caddies) ? row.caddies[0] : row.caddies;
    if (!c) continue;
    const name =
      `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Caddie";
    const tg = String(c.telegram ?? "").trim();
    caddieByEntry.set(row.entry_id, {
      name,
      hasTelegram: /^\d+$/.test(tg),
    });
  }
  return caddieByEntry;
}

/** Caddies asignados por grupo (ronda) + jugadores con Telegram vinculado. */
export async function loadGroupCoverageForRound(
  supabase: SupabaseClient,
  tournamentId: string,
  roundId: string,
  membersByGroup: Map<string, string[]>,
  entryIdsByGroup: Map<string, string[]>
): Promise<Map<string, GroupCoverageInfo>> {
  const out = new Map<string, GroupCoverageInfo>();
  const allEntryIds = Array.from(
    new Set(Array.from(entryIdsByGroup.values()).flat())
  );

  const caddieByEntry = await loadCaddieByEntry(
    supabase,
    tournamentId,
    roundId,
    allEntryIds
  );

  const playerTelegram = new Set<string>();
  if (allEntryIds.length > 0) {
    const { data: entriesRaw } = await supabase
      .from("tournament_entries")
      .select("id, players ( telegram_user_id )")
      .in("id", allEntryIds);
    type ERow = {
      id: string;
      players:
        | { telegram_user_id: string | null }
        | { telegram_user_id: string | null }[]
        | null;
    };
    for (const e of (entriesRaw ?? []) as unknown as ERow[]) {
      const p = Array.isArray(e.players) ? e.players[0] : e.players;
      if (p?.telegram_user_id?.trim()) playerTelegram.add(e.id);
    }
  }

  for (const [groupId, entryIds] of entryIdsByGroup) {
    const caddieMap = new Map<string, CaddieCoverage>();
    let playersWithTelegram = 0;
    for (const eid of entryIds) {
      if (playerTelegram.has(eid)) playersWithTelegram += 1;
      const c = caddieByEntry.get(eid);
      if (c) caddieMap.set(c.name, c);
    }
    const playerNames = membersByGroup.get(groupId) ?? [];
    out.set(groupId, {
      caddies: Array.from(caddieMap.values()),
      playersWithTelegram,
      playerCount: playerNames.length,
    });
  }

  return out;
}
