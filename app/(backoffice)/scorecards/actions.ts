"use server";

import {
  buildScorecardSummary,
  createScorecardAuditLog,
  createSignatureRequest,
  disputeScorecard,
  getOrCreateScorecard,
  getSignatureRequestByToken,
  lockScorecard,
  markSignatureRequestUsed,
  saveScorecardAuditLog,
  saveScorecardSignature,
  signScorecard,
  updateScorecardState,
} from "@/lib/scorecards";
import { alignCaptureToScorecardRound } from "@/lib/scorecards/alignCaptureToScorecardRound";
import { assertEighteenHolesBeforeLock } from "@/lib/scorecards/countHolesOnPlayerRound";
import { resolveRoundIdForEntry } from "@/lib/rounds/resolveRoundForEntry";
import { createAdminClient } from "@/utils/supabase/admin";

/**
 * Construye tarjeta (solo lógica, no DB)
 */
export async function buildScorecardSummaryAction(input: {
  scorecard_id: string;
  entry_id: string;
  round_id: string;
  tournament_id?: string | null;
  status?: any;
  holeScores: any[];
  is_disqualified?: boolean | null;
  is_withdrawn?: boolean | null;
  marker_signed_at?: string | null;
  player_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
}) {
  return buildScorecardSummary(input);
}

/**
 * Obtiene o crea tarjeta en DB
 */
export async function getOrCreateScorecardAction(input: {
  tournament_id: string;
  round_id: string;
  entry_id: string;
}) {
  return getOrCreateScorecard(input);
}

/**
 * Lee solicitud de firma por token
 */
export async function getSignatureRequestByTokenAction(input: {
  token: string;
}) {
  return getSignatureRequestByToken(input.token);
}

/**
 * Crea solicitud de firma remota
 */
export async function createSignatureRequestAction(input: {
  scorecard_id: string;
  role: "player" | "marker" | "witness";
  requested_phone?: string | null;
  requested_name?: string | null;
  expires_in_hours?: number;
}) {
  return createSignatureRequest(input);
}

/**
 * Firma tarjeta + guarda en DB + auditoría
 */
export async function signScorecardAction(input: {
  scorecard_id: string;
  current_status: any;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
  role: "player" | "marker" | "witness" | "staff";
  signer_name: string;
  signer_player_id?: string | null;
  signer_phone?: string | null;
  signed_text?: string | null;
  signature_payload?: string | null;
}) {
  const signResult = signScorecard(
    {
      status: input.current_status,
      player_signed_at: input.player_signed_at ?? null,
      marker_signed_at: input.marker_signed_at ?? null,
      witness_signed_at: input.witness_signed_at ?? null,
      locked_at: input.locked_at ?? null,
    },
    {
      scorecard_id: input.scorecard_id,
      role: input.role,
      signer_name: input.signer_name,
      signer_player_id: input.signer_player_id ?? null,
      signer_phone: input.signer_phone ?? null,
      signed_text: input.signed_text ?? null,
      signature_payload: input.signature_payload ?? null,
    }
  );

  const savedSignature = await saveScorecardSignature(signResult.signature);

  const lockResult = lockScorecard({
    status: signResult.nextStatus,
    player_signed_at: signResult.player_signed_at,
    marker_signed_at: signResult.marker_signed_at,
    witness_signed_at: signResult.witness_signed_at,
    locked_at: input.locked_at ?? null,
    actor_role: input.role,
  });

  const isFullySigned = Boolean(
    signResult.player_signed_at &&
      signResult.marker_signed_at &&
      signResult.witness_signed_at
  );

  const lockedAt = isFullySigned
    ? lockResult.locked_at ?? new Date().toISOString()
    : lockResult.locked_at;

  const admin = createAdminClient();
  const { data: scRow } = await admin
    .from("scorecards")
    .select("tournament_id, entry_id, round_id")
    .eq("id", input.scorecard_id)
    .maybeSingle();

  const { data: entryRow } = scRow?.entry_id
    ? await admin
        .from("tournament_entries")
        .select("player_id")
        .eq("id", scRow.entry_id)
        .maybeSingle()
    : { data: null };

  if (lockedAt && scRow?.round_id && entryRow?.player_id) {
    await assertEighteenHolesBeforeLock(
      admin,
      String(entryRow.player_id),
      String(scRow.round_id)
    );
  }

  const updatedScorecard = await updateScorecardState({
    scorecard_id: input.scorecard_id,
    status: lockResult.nextStatus,
    player_signed_at: signResult.player_signed_at,
    marker_signed_at: signResult.marker_signed_at,
    witness_signed_at: signResult.witness_signed_at,
    locked_at: lockedAt,
  });

  const auditLog = createScorecardAuditLog({
    scorecard_id: input.scorecard_id,
    action: "signature_added",
    actor_type: input.role,
    actor_id: input.signer_player_id ?? null,
    actor_name: input.signer_name,
    old_value: {
      status: input.current_status,
      player_signed_at: input.player_signed_at ?? null,
      marker_signed_at: input.marker_signed_at ?? null,
      witness_signed_at: input.witness_signed_at ?? null,
      locked_at: input.locked_at ?? null,
    },
    new_value: {
      status: updatedScorecard.status,
      player_signed_at: updatedScorecard.player_signed_at,
      marker_signed_at: updatedScorecard.marker_signed_at,
      witness_signed_at: updatedScorecard.witness_signed_at,
      locked_at: updatedScorecard.locked_at,
      fully_signed: isFullySigned,
    },
  });

  const savedAuditLog = await saveScorecardAuditLog(auditLog);

  if (updatedScorecard.locked_at) {
    if (
      scRow?.tournament_id &&
      scRow.entry_id &&
      scRow.round_id &&
      entryRow?.player_id
    ) {
      try {
        await alignCaptureToScorecardRound(admin, {
          tournamentId: String(scRow.tournament_id),
          entryId: String(scRow.entry_id),
          playerId: String(entryRow.player_id),
          scorecardRoundId: String(scRow.round_id),
        });
      } catch (e) {
        console.error("[signScorecardAction] alignCapture:", e);
      }

      const { revalidatePath } = await import("next/cache");
      revalidatePath("/score-entry");
      revalidatePath("/leaderboard");
      revalidatePath(`/torneos/${scRow.tournament_id}`);
    }
  }

  return {
    signature: signResult.signature,
    savedSignature,
    nextStatus: updatedScorecard.status,
    player_signed_at: updatedScorecard.player_signed_at,
    marker_signed_at: updatedScorecard.marker_signed_at,
    witness_signed_at: updatedScorecard.witness_signed_at,
    locked_at: updatedScorecard.locked_at,
    locked: isFullySigned,
    updatedScorecard,
    auditLog: savedAuditLog,
  };
}

/**
 * Firma usando token remoto
 */
export async function signScorecardByTokenAction(input: {
  token: string;
  current_status: any;
  player_signed_at?: string | null;
  marker_signed_at?: string | null;
  witness_signed_at?: string | null;
  locked_at?: string | null;
  signer_name?: string | null;
  signer_phone?: string | null;
  signed_text?: string | null;
  signature_payload?: string | null;
}) {
  const admin = createAdminClient();
  const request = await getSignatureRequestByToken(input.token);

  const signerName =
    input.signer_name?.trim() ||
    request.requested_name?.trim() ||
    "Firma remota";

  const signResult = signScorecard(
    {
      status: input.current_status,
      player_signed_at: input.player_signed_at ?? null,
      marker_signed_at: input.marker_signed_at ?? null,
      witness_signed_at: input.witness_signed_at ?? null,
      locked_at: input.locked_at ?? null,
    },
    {
      scorecard_id: request.scorecard_id,
      role: request.role,
      signer_name: signerName,
      signer_phone: input.signer_phone ?? request.requested_phone ?? null,
      signed_text: input.signed_text ?? null,
      signature_payload: input.signature_payload ?? null,
    }
  );

  const savedSignature = await saveScorecardSignature(signResult.signature);

  const lockResult = lockScorecard({
    status: signResult.nextStatus,
    player_signed_at: signResult.player_signed_at,
    marker_signed_at: signResult.marker_signed_at,
    witness_signed_at: signResult.witness_signed_at,
    locked_at: input.locked_at ?? null,
    actor_role: request.role,
  });

  const isFullySigned = Boolean(
    signResult.player_signed_at &&
      signResult.marker_signed_at &&
      signResult.witness_signed_at
  );

  const lockedAt = isFullySigned
    ? lockResult.locked_at ?? new Date().toISOString()
    : lockResult.locked_at;

  const { data: scRowForLock } = await admin
    .from("scorecards")
    .select("tournament_id, entry_id, round_id")
    .eq("id", request.scorecard_id)
    .maybeSingle();

  const { data: entryRowForLock } = scRowForLock?.entry_id
    ? await admin
        .from("tournament_entries")
        .select("player_id")
        .eq("id", scRowForLock.entry_id)
        .maybeSingle()
    : { data: null };

  if (lockedAt && scRowForLock?.round_id && entryRowForLock?.player_id) {
    await assertEighteenHolesBeforeLock(
      admin,
      String(entryRowForLock.player_id),
      String(scRowForLock.round_id)
    );
  }

  const updatedScorecard = await updateScorecardState({
    scorecard_id: request.scorecard_id,
    status: lockResult.nextStatus,
    player_signed_at: signResult.player_signed_at,
    marker_signed_at: signResult.marker_signed_at,
    witness_signed_at: signResult.witness_signed_at,
    locked_at: lockedAt,
  });

  await markSignatureRequestUsed({ token: input.token });

  const auditLog = createScorecardAuditLog({
    scorecard_id: request.scorecard_id,
    action: "signature_added",
    actor_type: request.role,
    actor_name: signerName,
    old_value: {
      status: input.current_status,
      player_signed_at: input.player_signed_at ?? null,
      marker_signed_at: input.marker_signed_at ?? null,
      witness_signed_at: input.witness_signed_at ?? null,
      locked_at: input.locked_at ?? null,
      token: input.token,
    },
    new_value: {
      status: updatedScorecard.status,
      player_signed_at: updatedScorecard.player_signed_at,
      marker_signed_at: updatedScorecard.marker_signed_at,
      witness_signed_at: updatedScorecard.witness_signed_at,
      locked_at: updatedScorecard.locked_at,
      fully_signed: isFullySigned,
      token_used: true,
      remote_role: request.role,
    },
  });

  const savedAuditLog = await saveScorecardAuditLog(auditLog);

  if (updatedScorecard.locked_at) {
    const { data: scRow } = await admin
      .from("scorecards")
      .select("tournament_id, entry_id, round_id")
      .eq("id", request.scorecard_id)
      .maybeSingle();

    const { data: entryRow } = scRow?.entry_id
      ? await admin
          .from("tournament_entries")
          .select("player_id")
          .eq("id", scRow.entry_id)
          .maybeSingle()
      : { data: null };

    if (
      scRow?.tournament_id &&
      scRow.entry_id &&
      scRow.round_id &&
      entryRow?.player_id
    ) {
      try {
        await alignCaptureToScorecardRound(admin, {
          tournamentId: String(scRow.tournament_id),
          entryId: String(scRow.entry_id),
          playerId: String(entryRow.player_id),
          scorecardRoundId: String(scRow.round_id),
        });
      } catch (e) {
        console.error("[signScorecardByToken] alignCapture:", e);
      }

      const { revalidatePath } = await import("next/cache");
      revalidatePath("/score-entry");
      revalidatePath("/leaderboard");
      revalidatePath(`/torneos/${scRow.tournament_id}`);
    }
  }

  return {
    request,
    signature: signResult.signature,
    savedSignature,
    nextStatus: updatedScorecard.status,
    player_signed_at: updatedScorecard.player_signed_at,
    marker_signed_at: updatedScorecard.marker_signed_at,
    witness_signed_at: updatedScorecard.witness_signed_at,
    locked_at: updatedScorecard.locked_at,
    locked: isFullySigned,
    updatedScorecard,
    auditLog: savedAuditLog,
  };
}

/**
 * Marcar tarjeta en disputa
 */
export async function disputeScorecardAction(input: {
  scorecard_id: string;
  current_status: any;
  locked_at?: string | null;
  reason: string;
  actor_name?: string | null;
  actor_id?: string | null;
  actor_type?: "player" | "marker" | "witness" | "staff" | "system";
}) {
  const disputeResult = disputeScorecard({
    currentStatus: input.current_status,
    locked_at: input.locked_at ?? null,
    reason: input.reason,
  });

  const updatedScorecard = await updateScorecardState({
    scorecard_id: input.scorecard_id,
    status: disputeResult.nextStatus,
    dispute_reason: disputeResult.dispute_reason,
    disputed_at: disputeResult.disputed_at,
  });

  const auditLog = createScorecardAuditLog({
    scorecard_id: input.scorecard_id,
    action: "disputed",
    actor_type: input.actor_type ?? "system",
    actor_id: input.actor_id ?? null,
    actor_name: input.actor_name ?? null,
    old_value: {
      status: input.current_status,
      locked_at: input.locked_at ?? null,
    },
    new_value: {
      status: updatedScorecard.status,
      dispute_reason: updatedScorecard.dispute_reason,
      disputed_at: updatedScorecard.disputed_at,
    },
  });

  const savedAuditLog = await saveScorecardAuditLog(auditLog);

  return {
    nextStatus: updatedScorecard.status,
    dispute_reason: updatedScorecard.dispute_reason,
    disputed_at: updatedScorecard.disputed_at,
    updatedScorecard,
    auditLog: savedAuditLog,
  };
}

/**
 * Crear scorecard + tokens de firma remota
 */
export async function createScorecardWithTokensAction(input: {
  tournament_id: string;
  round_id: string;
  entry_id: string;
}) {
  const admin = createAdminClient();

  const { data: entryRow, error: entryErr } = await admin
    .from("tournament_entries")
    .select("category_id")
    .eq("id", input.entry_id)
    .maybeSingle();

  if (entryErr) {
    throw new Error(`Error leyendo inscripción: ${entryErr.message}`);
  }

  const { data: roundsData, error: roundsErr } = await admin
    .from("rounds")
    .select(
      "id, tournament_id, round_no, round_date, category_id, wave, start_type, start_time, interval_minutes"
    )
    .eq("tournament_id", input.tournament_id);

  if (roundsErr) {
    throw new Error(`Error leyendo rondas: ${roundsErr.message}`);
  }

  const rounds = (roundsData ?? []).map((r) => ({
    id: String(r.id),
    tournament_id: String(r.tournament_id),
    round_no: Number(r.round_no),
    round_date: r.round_date ?? null,
    category_id: r.category_id ?? null,
    wave: r.wave ?? null,
    start_type: r.start_type ?? null,
    start_time: r.start_time ?? null,
    interval_minutes: r.interval_minutes ?? null,
  }));

  const resolvedRoundId = resolveRoundIdForEntry(
    rounds,
    input.round_id,
    entryRow?.category_id ?? null
  );

  const scorecard = await getOrCreateScorecard({
    tournament_id: input.tournament_id,
    round_id: resolvedRoundId,
    entry_id: input.entry_id,
  });

  const playerReq = await createSignatureRequest({
    scorecard_id: scorecard.id,
    role: "player",
  });

  const markerReq = await createSignatureRequest({
    scorecard_id: scorecard.id,
    role: "marker",
  });

  const witnessReq = await createSignatureRequest({
    scorecard_id: scorecard.id,
    role: "witness",
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://staging.listgolf.club";

  return {
    scorecard_id: scorecard.id,
    player_token: playerReq.token,
    marker_token: markerReq.token,
    witness_token: witnessReq.token,
    player_url: `${baseUrl}/sign/scorecard/${playerReq.token}`,
    marker_url: `${baseUrl}/sign/scorecard/${markerReq.token}`,
    witness_url: `${baseUrl}/sign/scorecard/${witnessReq.token}`,
  };
}