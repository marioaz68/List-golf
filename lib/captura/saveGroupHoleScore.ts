import type { SupabaseClient } from "@supabase/supabase-js";
import type { HoleNumber } from "./types";

export type SaveHoleScoreResult =
  | {
      ok: true;
      strokes: number | null;
      /** True si la celda quedó marcada como pendiente de aprobación por el testigo. */
      pendingWitness?: boolean;
      /** True si el jugador levantó (no terminó el hoyo) — solo match play. */
      pickedUp?: boolean;
    }
  | { ok: false; error: string };

function safeString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

type ExistingHoleRow = {
  id: string;
  strokes: number | null;
  pending_witness?: boolean | null;
  hole_no?: number | null;
  hole_number?: number | null;
};

/** Busca fila de hoyo por round_score_id (hole_number o hole_no legacy). */
async function findExistingHoleRow(
  admin: SupabaseClient,
  roundScoreId: string,
  hole: HoleNumber
): Promise<ExistingHoleRow | null> {
  const { data: rows } = await admin
    .from("hole_scores")
    .select("id, strokes, pending_witness, hole_no, hole_number")
    .eq("round_score_id", roundScoreId);

  for (const row of rows ?? []) {
    const r = row as ExistingHoleRow;
    const h =
      typeof r.hole_number === "number"
        ? r.hole_number
        : typeof r.hole_no === "number"
          ? r.hole_no
          : null;
    if (h === hole) return r;
  }
  return null;
}

/** Guarda o borra un score de un hoyo para un entry en la ronda del grupo. */
export async function saveGroupHoleScore(
  admin: SupabaseClient,
  params: {
    groupId: string;
    entryId: string;
    hole: HoleNumber;
    strokes: number | null;
    /** Match play: el jugador no terminó el hoyo (levantó). Cuando es
     *  true, `strokes` se ignora y se guarda `null`. */
    pickedUp?: boolean;
    /**
     * Modo de la operación:
     *  - "modify"  : caddie/jugador captura/modifica (puede dejar la celda en rojo)
     *  - "approve" : testigo aprueba el cambio (limpia el flag pending)
     */
    mode?: "modify" | "approve";
    /** Quién está capturando (sirve para auditoría/lectura futura). */
    actorRole?: "player" | "caddie" | "witness" | "admin" | null;
  }
): Promise<SaveHoleScoreResult> {
  const groupId = params.groupId.trim();
  const entryId = params.entryId.trim();
  const hole = params.hole;
  const pickedUp = Boolean(params.pickedUp);

  if (!groupId || !entryId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  // Si el jugador levantó (X), forzamos strokes=null y aceptamos el
  // registro aunque no tengamos número.
  const strokesValue = pickedUp ? null : params.strokes;

  if (strokesValue != null) {
    if (!Number.isFinite(strokesValue) || strokesValue < 1 || strokesValue > 15) {
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

  const existingHole = await findExistingHoleRow(admin, roundScoreId, hole);

  const mode = params.mode ?? "modify";
  const actorRole = params.actorRole ?? null;
  let pendingWitness = false;

  if (strokesValue == null && !pickedUp) {
    // Borrar (score vacío y sin marca de levantó).
    if (existingHole?.id) {
      await admin.from("hole_scores").delete().eq("id", existingHole.id);
    }
  } else if (existingHole?.id) {
    const previousStrokes =
      typeof existingHole.strokes === "number" ? existingHole.strokes : null;

    if (mode === "approve") {
      // Testigo confirma: limpia rojo (mismo score o distinto).
      pendingWitness = false;
    } else if (previousStrokes != null) {
      // Ya había valor: cualquier recaptura marca pendiente de testigo.
      pendingWitness = true;
    } else {
      pendingWitness = false;
    }

    const { error: upErr } = await admin
      .from("hole_scores")
      .update({
        strokes: strokesValue,
        hole_no: hole,
        hole_number: hole,
        entry_id: entryId,
        round_id: roundId,
        picked_up: pickedUp,
        pending_witness: pendingWitness,
        pending_at: pendingWitness ? new Date().toISOString() : null,
        pending_by_role: pendingWitness ? actorRole : null,
      })
      .eq("id", existingHole.id);
    if (upErr) return { ok: false, error: upErr.message };
  } else {
    // Inserción nueva: la primera captura nunca queda pendiente.
    const { error: insErr } = await admin.from("hole_scores").insert({
      round_score_id: roundScoreId,
      entry_id: entryId,
      round_id: roundId,
      hole_no: hole,
      hole_number: hole,
      strokes: strokesValue,
      picked_up: pickedUp,
      pending_witness: false,
    });
    if (insErr) return { ok: false, error: insErr.message };
  }

  const { data: allHoles } = await admin
    .from("hole_scores")
    .select("strokes, hole_no, hole_number")
    .eq("round_score_id", roundScoreId);

  // El gross stroke play se calcula solo sobre los 18 hoyos normales.
  // Los hoyos 19-27 son del desempate de match play y no deben sumarse al
  // total de la ronda de stroke play.
  const gross =
    (allHoles ?? []).reduce((acc, row) => {
      const h =
        typeof (row as { hole_number?: number | null }).hole_number === "number"
          ? (row as { hole_number?: number | null }).hole_number!
          : typeof (row as { hole_no?: number | null }).hole_no === "number"
            ? (row as { hole_no?: number | null }).hole_no!
            : 0;
      if (h < 1 || h > 18) return acc;
      const s = typeof row.strokes === "number" ? row.strokes : 0;
      return acc + s;
    }, 0) || null;

  await admin
    .from("round_scores")
    .update({ gross_score: gross })
    .eq("id", roundScoreId);

  return {
    ok: true,
    strokes: strokesValue,
    pendingWitness,
    pickedUp,
  };
}
