import type { SupabaseClient } from "@supabase/supabase-js";

export type CardSignatureRow = {
  entryId: string;
  signedByPlayerAt: string | null;
  signedByWitnessAt: string | null;
  signedByWitnessEntryId: string | null;
};

export type CardSignaturesByEntry = Record<string, CardSignatureRow>;

/** Lee todas las firmas registradas para el grupo. */
export async function loadCardSignaturesForGroup(
  admin: SupabaseClient,
  groupId: string,
  entryIds: string[]
): Promise<CardSignaturesByEntry> {
  const out: CardSignaturesByEntry = {};
  for (const id of entryIds) {
    out[id] = {
      entryId: id,
      signedByPlayerAt: null,
      signedByWitnessAt: null,
      signedByWitnessEntryId: null,
    };
  }
  if (!groupId || entryIds.length === 0) return out;

  const { data } = await admin
    .from("card_signatures")
    .select(
      "entry_id, signed_by_player_at, signed_by_witness_at, signed_by_witness_entry_id"
    )
    .eq("group_id", groupId)
    .in("entry_id", entryIds);

  for (const row of (data ?? []) as Array<{
    entry_id: string;
    signed_by_player_at: string | null;
    signed_by_witness_at: string | null;
    signed_by_witness_entry_id: string | null;
  }>) {
    const eid = String(row.entry_id ?? "").trim();
    if (!eid || !(eid in out)) continue;
    out[eid] = {
      entryId: eid,
      signedByPlayerAt: row.signed_by_player_at ?? null,
      signedByWitnessAt: row.signed_by_witness_at ?? null,
      signedByWitnessEntryId: row.signed_by_witness_entry_id ?? null,
    };
  }

  return out;
}

export type SignCardResult =
  | {
      ok: true;
      signedByPlayerAt: string | null;
      signedByWitnessAt: string | null;
      signedByWitnessEntryId: string | null;
    }
  | { ok: false; error: string };

/**
 * Guarda una firma para la tarjeta del entry indicado.
 * - role="player": registra signed_by_player_at.
 * - role="witness": registra signed_by_witness_at + signed_by_witness_entry_id.
 *
 * Idempotente: si ya hay firma de ese rol, no se reescribe el timestamp.
 */
export async function saveCardSignature(
  admin: SupabaseClient,
  params: {
    groupId: string;
    entryId: string;
    role: "player" | "witness";
    /** entry_id del testigo (sólo para role="witness"). */
    witnessEntryId?: string | null;
  }
): Promise<SignCardResult> {
  const gid = params.groupId.trim();
  const eid = params.entryId.trim();
  if (!gid || !eid) return { ok: false, error: "Parámetros incompletos." };

  // Validar que el entry pertenezca al grupo.
  const { data: member } = await admin
    .from("pairing_group_members")
    .select("id")
    .eq("group_id", gid)
    .eq("entry_id", eid)
    .maybeSingle();
  if (!member?.id) {
    return { ok: false, error: "El jugador no pertenece a este grupo." };
  }

  // Obtener round_id del grupo (para la columna nullable round_id).
  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("round_id")
    .eq("id", gid)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim() || null;

  if (params.role === "witness") {
    const witnessEid = String(params.witnessEntryId ?? "").trim();
    if (!witnessEid) {
      return { ok: false, error: "Falta el entry del testigo." };
    }
    // Verificar que efectivamente es el testigo asignado.
    const { data: witnessRow } = await admin
      .from("score_witnesses")
      .select("witness_entry_id")
      .eq("group_id", gid)
      .eq("entry_id", eid)
      .maybeSingle();
    if (!witnessRow || witnessRow.witness_entry_id !== witnessEid) {
      return {
        ok: false,
        error: "No estás autorizado como testigo de este jugador.",
      };
    }
  }

  const { data: existing } = await admin
    .from("card_signatures")
    .select(
      "id, signed_by_player_at, signed_by_witness_at, signed_by_witness_entry_id"
    )
    .eq("group_id", gid)
    .eq("entry_id", eid)
    .maybeSingle();

  const nowIso = new Date().toISOString();
  let signedByPlayerAt: string | null =
    (existing?.signed_by_player_at as string | null) ?? null;
  let signedByWitnessAt: string | null =
    (existing?.signed_by_witness_at as string | null) ?? null;
  let signedByWitnessEntryId: string | null =
    (existing?.signed_by_witness_entry_id as string | null) ?? null;

  if (params.role === "player") {
    if (!signedByPlayerAt) signedByPlayerAt = nowIso;
  } else {
    if (!signedByWitnessAt) {
      signedByWitnessAt = nowIso;
      signedByWitnessEntryId = String(params.witnessEntryId ?? "").trim();
    }
  }

  const payload = {
    group_id: gid,
    entry_id: eid,
    round_id: roundId,
    signed_by_player_at: signedByPlayerAt,
    signed_by_witness_at: signedByWitnessAt,
    signed_by_witness_entry_id: signedByWitnessEntryId,
    updated_at: nowIso,
  };

  if (existing?.id) {
    const { error } = await admin
      .from("card_signatures")
      .update(payload)
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await admin.from("card_signatures").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  return {
    ok: true,
    signedByPlayerAt,
    signedByWitnessAt,
    signedByWitnessEntryId,
  };
}

export type LockScorecardResult =
  | { ok: true; locked: boolean; reason?: string }
  | { ok: false; error: string };

/**
 * Cierra automáticamente la tarjeta (`scorecards.locked_at`) cuando:
 *  - Las dos firmas (jugador + testigo) están presentes para este entry.
 *  - Los 18 hoyos tienen score capturado en `hole_scores`.
 *
 * Una vez cerrada, la fila entra a la clasificación oficial (los procesos
 * de leaderboard ya consultan `scorecards.locked_at`).
 *
 * Idempotente: si la tarjeta ya estaba cerrada, no la sobreescribe.
 */
export async function lockScorecardIfSignedAndComplete(
  admin: SupabaseClient,
  params: { groupId: string; entryId: string }
): Promise<LockScorecardResult> {
  const gid = params.groupId.trim();
  const eid = params.entryId.trim();
  if (!gid || !eid) return { ok: false, error: "Parámetros incompletos." };

  // 1) Firmas presentes.
  const { data: sig } = await admin
    .from("card_signatures")
    .select("signed_by_player_at, signed_by_witness_at")
    .eq("group_id", gid)
    .eq("entry_id", eid)
    .maybeSingle();
  if (!sig?.signed_by_player_at || !sig?.signed_by_witness_at) {
    return { ok: true, locked: false, reason: "missing_signatures" };
  }

  // 2) Round + tournament del grupo.
  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("round_id")
    .eq("id", gid)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim();
  if (!roundId) return { ok: true, locked: false, reason: "no_round_id" };

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, tournament_id")
    .eq("id", roundId)
    .maybeSingle();
  const tournamentId = String(roundRow?.tournament_id ?? "").trim();
  if (!tournamentId) {
    return { ok: true, locked: false, reason: "no_tournament_id" };
  }

  // 3) Verificar 18 hoyos capturados.
  const { data: holes } = await admin
    .from("hole_scores")
    .select("hole_number, hole_no, strokes, round_id")
    .eq("entry_id", eid)
    .eq("round_id", roundId);

  const seen = new Set<number>();
  for (const row of (holes ?? []) as Array<{
    hole_number?: number | null;
    hole_no?: number | null;
    strokes?: number | null;
  }>) {
    if (row.strokes == null) continue;
    const h =
      typeof row.hole_number === "number"
        ? row.hole_number
        : typeof row.hole_no === "number"
          ? row.hole_no
          : null;
    if (h != null && h >= 1 && h <= 18) seen.add(h);
  }
  if (seen.size < 18) {
    return { ok: true, locked: false, reason: "card_incomplete" };
  }

  // 4) Upsert / lock de la tarjeta.
  const nowIso = new Date().toISOString();
  const { data: existing } = await admin
    .from("scorecards")
    .select("id, locked_at")
    .eq("entry_id", eid)
    .eq("round_id", roundId)
    .maybeSingle();

  if (existing?.id) {
    if (existing.locked_at) {
      return { ok: true, locked: false, reason: "already_locked" };
    }
    const { error } = await admin
      .from("scorecards")
      .update({
        status: "locked",
        locked_at: nowIso,
        player_signed_at: sig.signed_by_player_at,
        witness_signed_at: sig.signed_by_witness_at,
        updated_at: nowIso,
      })
      .eq("id", existing.id);
    if (error) return { ok: false, error: error.message };
    return { ok: true, locked: true };
  }

  const { error } = await admin.from("scorecards").insert({
    tournament_id: tournamentId,
    round_id: roundId,
    entry_id: eid,
    status: "locked",
    locked_at: nowIso,
    player_signed_at: sig.signed_by_player_at,
    witness_signed_at: sig.signed_by_witness_at,
    updated_at: nowIso,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, locked: true };
}
