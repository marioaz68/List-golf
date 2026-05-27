import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoleNumber } from "./types";

export type SaveHoleScoreResult =
  | { ok: true; strokes: number | null }
  | { ok: false; error: string };

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Guarda o borra un score de un hoyo para un entry en la ronda del grupo. */
export async function saveGroupHoleScore(
  admin: SupabaseClient,
  params: {
    groupId: string;
    entryId: string;
    hole: HoleNumber;
    strokes: number | null;
  }
): Promise<SaveHoleScoreResult> {
  const groupId = params.groupId.trim();
  const entryId = params.entryId.trim();
  const hole = params.hole;

  if (!groupId || !entryId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  if (params.strokes != null) {
    if (!Number.isFinite(params.strokes) || params.strokes < 1 || params.strokes > 15) {
      return { ok: false, error: "Score inválido (1–15)." };
    }
  }

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id")
    .eq("id", groupId)
    .maybeSingle();

  const roundId = safeString(groupRow?.round_id);
  if (!roundId) {
    return { ok: false, error: "Grupo no encontrado." };
  }

  const { data: member } = await admin
    .from("pairing_group_members")
    .select("id")
    .eq("group_id", groupId)
    .eq("entry_id", entryId)
    .maybeSingle();

  if (!member?.id) {
    return { ok: false, error: "El jugador no pertenece a este grupo." };
  }

  const { data: entryRow } = await admin
    .from("tournament_entries")
    .select("id, player_id")
    .eq("id", entryId)
    .maybeSingle();

  const playerId = safeString(entryRow?.player_id);
  if (!playerId) {
    return { ok: false, error: "Inscripción no encontrada." };
  }

  let roundScoreId: string | undefined;
  const { data: existingRs } = await admin
    .from("round_scores")
    .select("id")
    .eq("round_id", roundId)
    .eq("player_id", playerId)
    .maybeSingle();

  roundScoreId = existingRs?.id as string | undefined;

  if (!roundScoreId) {
    const { data: inserted, error: insErr } = await admin
      .from("round_scores")
      .insert({
        round_id: roundId,
        player_id: playerId,
        gross_score: null,
      })
      .select("id")
      .single();
    if (insErr || !inserted?.id) {
      return {
        ok: false,
        error: insErr?.message ?? "No se pudo crear round_scores.",
      };
    }
    roundScoreId = String(inserted.id);
  }

  const { data: existingHole } = await admin
    .from("hole_scores")
    .select("id")
    .eq("round_score_id", roundScoreId)
    .eq("hole_number", hole)
    .maybeSingle();

  if (params.strokes == null) {
    if (existingHole?.id) {
      await admin.from("hole_scores").delete().eq("id", existingHole.id);
    }
  } else if (existingHole?.id) {
    const { error: upErr } = await admin
      .from("hole_scores")
      .update({
        strokes: params.strokes,
        hole_no: hole,
        hole_number: hole,
        entry_id: entryId,
        round_id: roundId,
      })
      .eq("id", existingHole.id);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    const { error: insErr } = await admin.from("hole_scores").insert({
      round_score_id: roundScoreId,
      entry_id: entryId,
      round_id: roundId,
      hole_no: hole,
      hole_number: hole,
      strokes: params.strokes,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { data: allHoles } = await admin
    .from("hole_scores")
    .select("strokes")
    .eq("round_score_id", roundScoreId);

  const gross =
    (allHoles ?? []).reduce((acc, row) => {
      const s = typeof row.strokes === "number" ? row.strokes : 0;
      return acc + s;
    }, 0) || null;

  await admin
    .from("round_scores")
    .update({ gross_score: gross })
    .eq("id", roundScoreId);

  return { ok: true, strokes: params.strokes };
}
