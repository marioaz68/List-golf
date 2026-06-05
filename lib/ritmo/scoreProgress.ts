import type { SupabaseClient } from "@supabase/supabase-js";

export type GroupScoreProgress = {
  /** Hoyos distintos (1..18) con captura en el grupo (máximo entre jugadores). */
  holesPlayed: number;
  /** Hoyo más avanzado con captura (1..18) o null. */
  lastHole: number | null;
  /** Timestamp de la última captura del grupo (de la bitácora) o null. */
  lastCaptureTs: string | null;
};

type HoleRow = {
  entry_id: string | null;
  hole_no: number | null;
  hole_number: number | null;
  strokes: number | null;
  picked_up: boolean | null;
};

function holeNo(row: HoleRow): number | null {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

/**
 * Progreso de captura por grupo: cuántos hoyos lleva capturados el grupo y
 * cuándo fue la última captura. Sirve para mostrar el ritmo aunque nadie
 * comparta GPS (el ritmo se deriva de los escores que captura el caddie).
 */
export async function loadGroupScoreProgress(
  admin: SupabaseClient,
  roundId: string,
  entryIdsByGroup: Map<string, string[]>
): Promise<Map<string, GroupScoreProgress>> {
  const out = new Map<string, GroupScoreProgress>();
  const allEntryIds = Array.from(
    new Set(Array.from(entryIdsByGroup.values()).flat())
  );
  if (allEntryIds.length === 0) return out;

  // Mapa entry_id → group_id.
  const groupByEntry = new Map<string, string>();
  for (const [gid, eids] of entryIdsByGroup) {
    for (const eid of eids) groupByEntry.set(eid, gid);
  }

  // Hoyos capturados (1..18) por entry, de hole_scores.
  const holesByEntry = new Map<string, Set<number>>();
  const lastHoleByEntry = new Map<string, number>();
  {
    const { data } = await admin
      .from("hole_scores")
      .select("entry_id, hole_no, hole_number, strokes, picked_up")
      .eq("round_id", roundId)
      .in("entry_id", allEntryIds);
    for (const row of (data ?? []) as HoleRow[]) {
      const eid = row.entry_id;
      if (!eid) continue;
      const h = holeNo(row);
      if (h == null) continue;
      // Cuenta como jugado si tiene strokes o se levantó (picked_up).
      const played = row.strokes != null || row.picked_up === true;
      if (!played) continue;
      const set = holesByEntry.get(eid) ?? new Set<number>();
      set.add(h);
      holesByEntry.set(eid, set);
      if (h > (lastHoleByEntry.get(eid) ?? 0)) lastHoleByEntry.set(eid, h);
    }
  }

  // Última captura por entry, de la bitácora (hole_score_audit).
  const lastTsByEntry = new Map<string, string>();
  {
    const { data } = await admin
      .from("hole_score_audit")
      .select("entry_id, created_at")
      .eq("round_id", roundId)
      .in("entry_id", allEntryIds)
      .order("created_at", { ascending: false })
      .limit(3000);
    for (const row of (data ?? []) as {
      entry_id: string | null;
      created_at: string | null;
    }[]) {
      const eid = row.entry_id;
      if (!eid || !row.created_at) continue;
      if (!lastTsByEntry.has(eid)) lastTsByEntry.set(eid, row.created_at);
    }
  }

  // Agregar por grupo (máximo de hoyos, hoyo más avanzado, captura más reciente).
  for (const [gid, eids] of entryIdsByGroup) {
    let holesPlayed = 0;
    let lastHole: number | null = null;
    let lastCaptureTs: string | null = null;
    for (const eid of eids) {
      const n = holesByEntry.get(eid)?.size ?? 0;
      if (n > holesPlayed) holesPlayed = n;
      const lh = lastHoleByEntry.get(eid) ?? null;
      if (lh != null && (lastHole == null || lh > lastHole)) lastHole = lh;
      const ts = lastTsByEntry.get(eid) ?? null;
      if (ts && (!lastCaptureTs || ts > lastCaptureTs)) lastCaptureTs = ts;
    }
    out.set(gid, { holesPlayed, lastHole, lastCaptureTs });
  }

  return out;
}

/**
 * Hoyo "actual" derivado de los hoyos jugados desde el tee de inicio.
 * Si lleva N hoyos completos, está jugando el hoyo N+1 (con wrap 1..18).
 * Devuelve null si no ha capturado o si ya terminó (>=18).
 */
export function currentHoleFromHolesPlayed(
  holesPlayed: number,
  startHole: number
): number | null {
  if (holesPlayed <= 0) return null;
  if (holesPlayed >= 18) return null;
  return ((startHole - 1 + holesPlayed) % 18) + 1;
}
