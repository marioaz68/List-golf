import type { SupabaseClient } from "@supabase/supabase-js";
import { loadGroupPairSides } from "./loadGroupPairSides";
import {
  isOpposingWitness,
  opposingOf,
  pairMatesOf,
  samePair,
  type PairSides,
} from "./pairWitness";

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
      /** Todas las tarjetas tocadas (en parejas: la pareja y la rival). */
      updated: CardSignatureRow[];
    }
  | { ok: false; error: string };

async function upsertSignatureRow(
  admin: SupabaseClient,
  params: {
    groupId: string;
    entryId: string;
    roundId: string | null;
    nowIso: string;
    role: "player" | "witness";
    witnessEntryId?: string | null;
  }
): Promise<{ ok: true; row: CardSignatureRow } | { ok: false; error: string }> {
  const { data: existing } = await admin
    .from("card_signatures")
    .select(
      "id, signed_by_player_at, signed_by_witness_at, signed_by_witness_entry_id"
    )
    .eq("group_id", params.groupId)
    .eq("entry_id", params.entryId)
    .maybeSingle();

  let signedByPlayerAt: string | null =
    (existing?.signed_by_player_at as string | null) ?? null;
  let signedByWitnessAt: string | null =
    (existing?.signed_by_witness_at as string | null) ?? null;
  let signedByWitnessEntryId: string | null =
    (existing?.signed_by_witness_entry_id as string | null) ?? null;

  if (params.role === "player") {
    if (!signedByPlayerAt) signedByPlayerAt = params.nowIso;
  } else if (!signedByWitnessAt) {
    signedByWitnessAt = params.nowIso;
    signedByWitnessEntryId = String(params.witnessEntryId ?? "").trim() || null;
  }

  const payload = {
    group_id: params.groupId,
    entry_id: params.entryId,
    round_id: params.roundId,
    signed_by_player_at: signedByPlayerAt,
    signed_by_witness_at: signedByWitnessAt,
    signed_by_witness_entry_id: signedByWitnessEntryId,
    updated_at: params.nowIso,
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
    row: {
      entryId: params.entryId,
      signedByPlayerAt,
      signedByWitnessAt,
      signedByWitnessEntryId,
    },
  };
}

async function canWitnessAssigned(
  admin: SupabaseClient,
  groupId: string,
  targetEntryId: string,
  witnessEntryId: string
): Promise<boolean> {
  const { data: witnessRow } = await admin
    .from("score_witnesses")
    .select("witness_entry_id")
    .eq("group_id", groupId)
    .eq("entry_id", targetEntryId)
    .maybeSingle();
  return Boolean(witnessRow && witnessRow.witness_entry_id === witnessEntryId);
}

/**
 * Guarda una firma para la tarjeta del entry indicado.
 * - role="player": registra signed_by_player_at.
 * - role="witness": registra signed_by_witness_at + signed_by_witness_entry_id.
 *
 * En parejas: un jugador firma por su pareja y atestigua a la pareja rival
 * (nunca al compañero). Idempotente: no reescribe timestamps ya puestos.
 */
export async function saveCardSignature(
  admin: SupabaseClient,
  params: {
    groupId: string;
    entryId: string;
    role: "player" | "witness";
    /** entry_id del testigo (sólo para role="witness"). */
    witnessEntryId?: string | null;
    /** Quien pulsa Firmar (role=player). En parejas cubre también al compañero. */
    actorEntryId?: string | null;
  }
): Promise<SignCardResult> {
  const gid = params.groupId.trim();
  const eid = params.entryId.trim();
  if (!gid || !eid) return { ok: false, error: "Parámetros incompletos." };

  const { data: member } = await admin
    .from("pairing_group_members")
    .select("id")
    .eq("group_id", gid)
    .eq("entry_id", eid)
    .maybeSingle();
  if (!member?.id) {
    return { ok: false, error: "El jugador no pertenece a este grupo." };
  }

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("round_id")
    .eq("id", gid)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim() || null;
  const pairSides = await loadGroupPairSides(admin, gid);
  const nowIso = new Date().toISOString();

  if (params.role === "player") {
    const signer = String(params.actorEntryId ?? eid).trim();
    if (pairSides) {
      if (!samePair(signer, eid, pairSides)) {
        return {
          ok: false,
          error: "Sólo un jugador de la pareja puede firmar esta tarjeta.",
        };
      }
    } else if (signer && signer !== eid) {
      return {
        ok: false,
        error: "Sólo el propio jugador puede firmar su tarjeta.",
      };
    }
  } else {
    const witnessEid = String(params.witnessEntryId ?? "").trim();
    if (!witnessEid) {
      return { ok: false, error: "Falta el entry del testigo." };
    }
    if (pairSides) {
      if (!isOpposingWitness(witnessEid, eid, pairSides)) {
        return {
          ok: false,
          error: "El testigo tiene que ser de la pareja rival, no tu compañero.",
        };
      }
    } else {
      const assigned = await canWitnessAssigned(admin, gid, eid, witnessEid);
      if (!assigned) {
        return {
          ok: false,
          error: "No estás autorizado como testigo de este jugador.",
        };
      }
    }
  }

  const playerTargets =
    params.role === "player" && pairSides
      ? pairMatesOf(eid, pairSides)
      : params.role === "player"
        ? [eid]
        : [];
  const witnessTargets =
    pairSides && (params.role === "witness" || params.role === "player")
      ? params.role === "witness"
        ? pairMatesOf(eid, pairSides)
        : opposingOf(String(params.actorEntryId ?? eid), pairSides)
      : params.role === "witness"
        ? [eid]
        : [];
  const witnessActor =
    params.role === "witness"
      ? String(params.witnessEntryId ?? "").trim()
      : String(params.actorEntryId ?? eid).trim();

  const updatedById = new Map<string, CardSignatureRow>();

  for (const target of playerTargets) {
    const res = await upsertSignatureRow(admin, {
      groupId: gid,
      entryId: target,
      roundId,
      nowIso,
      role: "player",
    });
    if (!res.ok) return res;
    updatedById.set(target, res.row);
  }

  for (const target of witnessTargets) {
    if (
      !witnessActor ||
      (pairSides && !isOpposingWitness(witnessActor, target, pairSides))
    ) {
      continue;
    }
    const res = await upsertSignatureRow(admin, {
      groupId: gid,
      entryId: target,
      roundId,
      nowIso,
      role: "witness",
      witnessEntryId: witnessActor,
    });
    if (!res.ok) return res;
    const prev = updatedById.get(target);
    updatedById.set(target, prev ? { ...prev, ...res.row } : res.row);
  }

  if (playerTargets.length === 0 && witnessTargets.length === 0) {
    const res = await upsertSignatureRow(admin, {
      groupId: gid,
      entryId: eid,
      roundId,
      nowIso,
      role: params.role,
      witnessEntryId: params.witnessEntryId,
    });
    if (!res.ok) return res;
    updatedById.set(eid, res.row);
  }

  const primary =
    updatedById.get(eid) ??
    [...updatedById.values()][0] ??
    {
      entryId: eid,
      signedByPlayerAt: null,
      signedByWitnessAt: null,
      signedByWitnessEntryId: null,
    };

  return {
    ok: true,
    signedByPlayerAt: primary.signedByPlayerAt,
    signedByWitnessAt: primary.signedByWitnessAt,
    signedByWitnessEntryId: primary.signedByWitnessEntryId,
    updated: [...updatedById.values()],
  };
}

/**
 * Si un jugador de la pareja ya firmó, copia esa firma al compañero
 * (y lo mismo con el testigo de la pareja rival).
 */
export async function healPairCardSignatures(
  admin: SupabaseClient,
  groupId: string,
  entryIds: string[],
  sides: PairSides | null
): Promise<void> {
  if (!sides || entryIds.length === 0) return;
  const map = await loadCardSignaturesForGroup(admin, groupId, entryIds);
  const nowIso = new Date().toISOString();
  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("round_id")
    .eq("id", groupId)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim() || null;

  for (const side of [sides.a, sides.b]) {
    const rows = side.map((id) => map[id]).filter(Boolean);
    const playerAt =
      rows.find((r) => r.signedByPlayerAt)?.signedByPlayerAt ?? null;
    const witnessSrc = rows.find((r) => {
      const wid = r.signedByWitnessEntryId;
      return Boolean(
        r.signedByWitnessAt &&
          wid &&
          isOpposingWitness(wid, r.entryId, sides)
      );
    });
    for (const eid of side) {
      const cur = map[eid];
      if (!cur) continue;
      const needPlayer = Boolean(playerAt) && !cur.signedByPlayerAt;
      const needWitness =
        Boolean(witnessSrc?.signedByWitnessAt) && !cur.signedByWitnessAt;
      if (!needPlayer && !needWitness) continue;
      await upsertSignatureRow(admin, {
        groupId,
        entryId: eid,
        roundId,
        nowIso,
        role: needPlayer ? "player" : "witness",
        witnessEntryId: needWitness
          ? witnessSrc?.signedByWitnessEntryId
          : null,
      });
      if (needPlayer && needWitness) {
        await upsertSignatureRow(admin, {
          groupId,
          entryId: eid,
          roundId,
          nowIso,
          role: "witness",
          witnessEntryId: witnessSrc?.signedByWitnessEntryId,
        });
      }
    }
  }
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
  params: {
    groupId: string;
    entryId: string;
    /** Hoyos mínimos capturados para cerrar (18 por defecto; match play
     *  decidido antes del 18 usa el hoyo de decisión). */
    holesRequired?: number;
  }
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
  const holesRequired = Math.min(
    18,
    Math.max(1, params.holesRequired ?? 18)
  );
  for (let h = 1; h <= holesRequired; h++) {
    if (!seen.has(h)) {
      return { ok: true, locked: false, reason: "card_incomplete" };
    }
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
