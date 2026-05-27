import type { SupabaseClient } from "@supabase/supabase-js";
import { ALL_HOLES } from "./loadGroupCapture";
import type { HoleNumber, HoleScores } from "./types";

export type PrivateHoleScoresByEntry = Record<string, HoleScores>;

function emptyScores(): HoleScores {
  const s = {} as HoleScores;
  for (const h of ALL_HOLES) s[h] = null;
  return s;
}

/** Lee las tarjetas privadas de TODOS los entries del grupo (en una sola query). */
export async function loadPrivateScoresForGroup(
  admin: SupabaseClient,
  groupId: string,
  entryIds: string[]
): Promise<PrivateHoleScoresByEntry> {
  const out: PrivateHoleScoresByEntry = {};
  for (const id of entryIds) out[id] = emptyScores();

  if (!groupId || entryIds.length === 0) return out;

  const { data } = await admin
    .from("private_hole_scores")
    .select("entry_id, hole_number, strokes")
    .eq("group_id", groupId)
    .in("entry_id", entryIds);

  for (const row of (data ?? []) as Array<{
    entry_id: string;
    hole_number: number;
    strokes: number | null;
  }>) {
    const eid = String(row.entry_id ?? "").trim();
    const hole = Number(row.hole_number);
    if (!eid || !Number.isFinite(hole) || hole < 1 || hole > 18) continue;
    const scores = out[eid];
    if (!scores) continue;
    scores[hole as HoleNumber] =
      typeof row.strokes === "number" ? row.strokes : null;
  }

  return out;
}

export type SavePrivateResult =
  | { ok: true; strokes: number | null }
  | { ok: false; error: string };

export async function savePrivateHoleScore(
  admin: SupabaseClient,
  params: {
    groupId: string;
    entryId: string;
    hole: HoleNumber;
    strokes: number | null;
    role: "player" | "caddie";
  }
): Promise<SavePrivateResult> {
  const gid = params.groupId.trim();
  const eid = params.entryId.trim();
  if (!gid || !eid) return { ok: false, error: "Parámetros incompletos." };

  if (params.strokes != null) {
    if (
      !Number.isFinite(params.strokes) ||
      params.strokes < 1 ||
      params.strokes > 15
    ) {
      return { ok: false, error: "Score inválido (1–15)." };
    }
  }

  const { data: member } = await admin
    .from("pairing_group_members")
    .select("id")
    .eq("group_id", gid)
    .eq("entry_id", eid)
    .maybeSingle();

  if (!member?.id) {
    return { ok: false, error: "El jugador no pertenece a este grupo." };
  }

  if (params.strokes == null) {
    const { error } = await admin
      .from("private_hole_scores")
      .delete()
      .eq("group_id", gid)
      .eq("entry_id", eid)
      .eq("hole_number", params.hole);
    if (error) return { ok: false, error: error.message };
    return { ok: true, strokes: null };
  }

  const { error } = await admin.from("private_hole_scores").upsert(
    {
      group_id: gid,
      entry_id: eid,
      hole_number: params.hole,
      strokes: params.strokes,
      last_edited_by_role: params.role,
      last_edited_at: new Date().toISOString(),
    },
    { onConflict: "group_id,entry_id,hole_number" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true, strokes: params.strokes };
}
