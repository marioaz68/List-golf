import type { SupabaseClient } from "@supabase/supabase-js";
import {
  countSequentialHolesFromStart,
  resolveGroupStartHole,
} from "@/lib/ritmo/startHole";

export type GroupScoreMeta = {
  starting_hole?: number | null;
  notes?: string | null;
};

export type GroupScoreProgress = {
  /** Hoyos completados en secuencia desde el tee de salida. */
  holesPlayed: number;
  /** Último hoyo completado en esa secuencia, o null. */
  lastHole: number | null;
  /** Hoyo de salida usado para el cálculo (BD / notas / capturas). */
  startHole: number;
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
  entryIdsByGroup: Map<string, string[]>,
  groupMeta?: Map<string, GroupScoreMeta>
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

  // Agregar por grupo: hoyos en secuencia desde el tee de salida.
  for (const [gid, eids] of entryIdsByGroup) {
    const meta = groupMeta?.get(gid);
    const captured = new Set<number>();
    let lastCaptureTs: string | null = null;
    for (const eid of eids) {
      for (const h of holesByEntry.get(eid) ?? []) captured.add(h);
      const ts = lastTsByEntry.get(eid) ?? null;
      if (ts && (!lastCaptureTs || ts > lastCaptureTs)) lastCaptureTs = ts;
    }
    const startHole = resolveGroupStartHole(
      meta?.starting_hole,
      meta?.notes,
      captured
    );
    const holesPlayed = countSequentialHolesFromStart(captured, startHole);
    const lastHole =
      holesPlayed > 0
        ? ((startHole - 1 + holesPlayed - 1) % 18) + 1
        : null;
    out.set(gid, { holesPlayed, lastHole, startHole, lastCaptureTs });
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
