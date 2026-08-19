import type { SupabaseClient } from "@supabase/supabase-js";

/** Orden canónico de inscripciones (inscripciones ↔ comité de handicaps). */
export const ENTRY_DISPLAY_ORDER_SPECS = [
  { column: "handicap_index", ascending: true, nullsFirst: false },
  { column: "player_number", ascending: true, nullsFirst: false },
] as const;

type OrderableQuery<T> = {
  order: (
    column: string,
    options?: { ascending?: boolean; nullsFirst?: boolean }
  ) => T;
};

/** Aplica el mismo orden HI → # jugador en consultas Supabase (previo a agrupar parejas). */
export function applyEntryDisplayOrder<T extends OrderableQuery<T>>(
  query: T
): T {
  let q = query;
  for (const spec of ENTRY_DISPLAY_ORDER_SPECS) {
    q = q.order(spec.column, {
      ascending: spec.ascending,
      nullsFirst: spec.nullsFirst,
    });
  }
  return q;
}

export type EntryPairSlot = {
  teamId: string;
  partnerEntryId: string;
  slot: 1 | 2;
};

export type EntrySortable = {
  id: string;
  handicap_index: number | null;
  player_number?: number | null;
};

/** Índice entry_id → pareja (match play por parejas). */
export async function loadEntryPairIndex(
  admin: SupabaseClient,
  tournamentId: string
): Promise<Map<string, EntryPairSlot>> {
  const map = new Map<string, EntryPairSlot>();
  const tid = String(tournamentId ?? "").trim();
  if (!tid) return map;

  const { data: teams } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id")
    .eq("tournament_id", tid)
    .eq("is_active", true);

  for (const row of teams ?? []) {
    const teamId = String((row as { id?: string }).id ?? "").trim();
    const a = String(
      (row as { player_a_entry_id?: string | null }).player_a_entry_id ?? ""
    ).trim();
    const b = String(
      (row as { player_b_entry_id?: string | null }).player_b_entry_id ?? ""
    ).trim();
    if (!teamId || !a || !b) continue;
    map.set(a, { teamId, partnerEntryId: b, slot: 1 });
    map.set(b, { teamId, partnerEntryId: a, slot: 2 });
  }
  return map;
}

function hiValue(hi: number | null | undefined): number {
  if (hi == null || !Number.isFinite(Number(hi))) return 9999;
  return Number(hi);
}

/**
 * Orden de inscripciones/comité: parejas J1+J2 juntas, bloques por suma de HI
 * (como reporte de handicaps por categoría), singles por HI.
 */
export function sortEntriesKeepingPairsTogether<T>(
  entries: T[],
  pairIndex: Map<string, EntryPairSlot>,
  pick: (entry: T) => EntrySortable
): T[] {
  if (entries.length <= 1 || pairIndex.size === 0) {
    return [...entries].sort((a, b) => compareSingles(pick(a), pick(b)));
  }

  const byId = new Map<string, T>();
  for (const e of entries) byId.set(pick(e).id, e);

  const used = new Set<string>();
  type Block = { sortKey: number; tieBreak: number; items: T[] };
  const blocks: Block[] = [];

  for (const e of entries) {
    const meta = pick(e);
    if (used.has(meta.id)) continue;

    const pair = pairIndex.get(meta.id);
    const partner =
      pair?.partnerEntryId != null ? byId.get(pair.partnerEntryId) : undefined;

    if (pair && partner) {
      used.add(meta.id);
      used.add(pick(partner).id);
      const jug1 = pair.slot === 1 ? e : partner;
      const jug2 = pair.slot === 2 ? e : partner;
      const hi1 = hiValue(pick(jug1).handicap_index);
      const hi2 = hiValue(pick(jug2).handicap_index);
      blocks.push({
        sortKey: hi1 + hi2,
        tieBreak: Math.min(hi1, hi2),
        items: [jug1, jug2],
      });
      continue;
    }

    used.add(meta.id);
    blocks.push({
      sortKey: hiValue(meta.handicap_index),
      tieBreak: meta.player_number ?? 9999,
      items: [e],
    });
  }

  blocks.sort((a, b) => {
    if (a.sortKey !== b.sortKey) return a.sortKey - b.sortKey;
    if (a.tieBreak !== b.tieBreak) return a.tieBreak - b.tieBreak;
    const aId = pick(a.items[0]).id;
    const bId = pick(b.items[0]).id;
    return aId.localeCompare(bId);
  });

  return blocks.flatMap((b) => b.items);
}

function compareSingles(a: EntrySortable, b: EntrySortable): number {
  const hiCmp = hiValue(a.handicap_index) - hiValue(b.handicap_index);
  if (hiCmp !== 0) return hiCmp;
  return (a.player_number ?? 9999) - (b.player_number ?? 9999);
}
