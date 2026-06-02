"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  checkTournamentAccess,
  requireTournamentAccess,
  tournamentAccessDeniedMessage,
} from "@/lib/auth/requireTournamentAccess";
import { lockScorecard } from "@/lib/scorecards/lock-scorecard";
import type { ScorecardStatus } from "@/lib/scorecards/types";
import { alignCaptureToScorecardRound } from "@/lib/scorecards/alignCaptureToScorecardRound";
import { countHolesOnPlayerRound } from "@/lib/scorecards/countHolesOnPlayerRound";
import { syncCaptureToEntryRound } from "@/lib/scorecards/syncCaptureToEntryRound";
import { loadCategoryRoundGateContext } from "@/lib/rounds/loadCategoryRoundGate";
import { repairTournamentRoundAlignment } from "@/lib/scorecards/repairTournamentRoundAlignment";
import type { SessionRoundFields } from "@/app/(backoffice)/tee-sheet/sessionBlock";
import { resolveEntryCaptureRound } from "@/lib/rounds/resolveEntryCaptureRound";
import {
  buildTournamentRoundCloseStatus,
  isTournamentRoundReadyToConfirm,
  mergeRoundClosure,
} from "@/lib/rounds/tournamentRoundClosure";
import {
  assertRegistrationClosedForTeeSheet,
  fetchTournamentRegistrationStatus,
} from "@/lib/tournaments/registrationGate";

export type SaveScoresSaveMode = "save" | "save_and_close" | "open_round";

export type SaveScoresState = {
  ok: boolean;
  message: string;
  saveMode?: SaveScoresSaveMode;
};

export type RepairCapturesState = {
  ok: boolean;
  message: string;
  repaired?: number;
  errors?: number;
};

function asInt(v: FormDataEntryValue | null) {
  const raw = String(v ?? "").trim();
  if (!raw) return null;

  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function supabaseErrText(err: unknown) {
  if (!err || typeof err !== "object") return "Error desconocido";

  const e = err as {
    message?: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
  };

  return [
    e.message ? `message: ${e.message}` : "",
    e.code ? `code: ${e.code}` : "",
    e.details ? `details: ${e.details}` : "",
    e.hint ? `hint: ${e.hint}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en variables de entorno."
    );
  }

  return createSupabaseAdminClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function getRoundMeta(
  admin: ReturnType<typeof getAdminClient>,
  roundId: string
) {
  const { data, error } = await admin
    .from("rounds")
    .select("id, tournament_id, round_no")
    .eq("id", roundId)
    .single();

  if (error || !data) {
    throw new Error("No se encontró la ronda");
  }

  return {
    tournamentId: String(data.tournament_id),
    roundNo: Number(data.round_no ?? 0),
  };
}

async function revalidateScoreEntryAndLeaderboard(tournamentId: string) {
  revalidatePath("/score-entry");
  revalidatePath("/leaderboard");
  revalidatePath(`/torneos/${tournamentId}`);
}

async function getEntryIdForTournamentAndPlayer(
  admin: ReturnType<typeof getAdminClient>,
  tournamentId: string,
  playerId: string
) {
  const { data: entryData, error: entryErr } = await admin
    .from("tournament_entries")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (entryErr) {
    throw new Error(
      `Error buscando tournament_entries: ${supabaseErrText(entryErr)}`
    );
  }

  if (!entryData?.id) {
    throw new Error(
      "No se encontró tournament_entries para este jugador en el torneo de la ronda."
    );
  }

  return String(entryData.id);
}

async function getEntryIdForRoundAndPlayer(
  admin: ReturnType<typeof getAdminClient>,
  roundId: string,
  playerId: string
) {
  const { data: roundData, error: roundErr } = await admin
    .from("rounds")
    .select("tournament_id")
    .eq("id", roundId)
    .single();

  if (roundErr || !roundData?.tournament_id) {
    throw new Error("No se pudo determinar el torneo de la ronda.");
  }

  return getEntryIdForTournamentAndPlayer(
    admin,
    String(roundData.tournament_id),
    playerId
  );
}

async function getScorecardForEntryAndRound(
  admin: ReturnType<typeof getAdminClient>,
  entryId: string,
  roundId: string
) {
  const { data, error } = await admin
    .from("scorecards")
    .select("id, locked_at")
    .eq("entry_id", entryId)
    .eq("round_id", roundId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error leyendo scorecard: ${supabaseErrText(error)}`);
  }

  return data;
}

async function getOrCreateScorecardForRound(
  admin: ReturnType<typeof getAdminClient>,
  params: {
    tournamentId: string;
    roundId: string;
    entryId: string;
  }
) {
  let { data: scorecard, error } = await admin
    .from("scorecards")
    .select(
      "id, status, player_signed_at, marker_signed_at, witness_signed_at, locked_at"
    )
    .eq("entry_id", params.entryId)
    .eq("round_id", params.roundId)
    .maybeSingle();

  if (error) {
    throw new Error(`Error leyendo scorecard: ${supabaseErrText(error)}`);
  }

  if (!scorecard?.id) {
    const { data: created, error: createErr } = await admin
      .from("scorecards")
      .insert({
        tournament_id: params.tournamentId,
        round_id: params.roundId,
        entry_id: params.entryId,
        status: "draft",
      })
      .select(
        "id, status, player_signed_at, marker_signed_at, witness_signed_at, locked_at"
      )
      .single();

    if (createErr || !created?.id) {
      throw new Error(
        `Error creando scorecard: ${supabaseErrText(createErr)}`
      );
    }

    scorecard = created;
  }

  return scorecard;
}

async function lockScorecardRow(
  admin: ReturnType<typeof getAdminClient>,
  scorecard: {
    id: string;
    player_signed_at: string | null;
    marker_signed_at: string | null;
    witness_signed_at: string | null;
    locked_at: string | null;
  }
) {
  if (scorecard.locked_at) return;

  const now = new Date().toISOString();
  const player_signed_at = scorecard.player_signed_at ?? now;
  const witness_signed_at = scorecard.witness_signed_at ?? now;

  const lockResult = lockScorecard({
    status: "signed_complete",
    player_signed_at,
    marker_signed_at: scorecard.marker_signed_at,
    witness_signed_at,
    locked_at: scorecard.locked_at,
    actor_role: "staff",
  });

  const lockedAt = lockResult.locked_at ?? now;

  const { error: upErr } = await admin
    .from("scorecards")
    .update({
      status: lockResult.nextStatus,
      player_signed_at,
      witness_signed_at,
      locked_at: lockedAt,
      updated_at: now,
    })
    .eq("id", scorecard.id);

  if (upErr) {
    throw new Error(`Error cerrando tarjeta: ${supabaseErrText(upErr)}`);
  }
}

/** Entrega en mesa: firmas jugador + testigo y cierre para leaderboard oficial. */
async function staffCloseRoundScorecard(
  admin: ReturnType<typeof getAdminClient>,
  params: {
    tournamentId: string;
    roundId: string;
    entryId: string;
    roundNo: number;
    playerId: string;
    minHolesRequired?: number;
  }
) {
  await alignCaptureToScorecardRound(admin, {
    tournamentId: params.tournamentId,
    entryId: params.entryId,
    playerId: params.playerId,
    scorecardRoundId: params.roundId,
  });

  const minHoles = Math.max(0, params.minHolesRequired ?? 18);
  const holeCount = await countHolesOnPlayerRound(
    admin,
    params.playerId,
    params.roundId
  );

  if (minHoles > 0 && holeCount < minHoles) {
    throw new Error(
      `No se puede cerrar la ronda: faltan hoyos (${holeCount}/${minHoles}). Complete la tarjeta o use solo «Guardar scores».`
    );
  }

  const scorecard = await getOrCreateScorecardForRound(admin, params);

  if (scorecard.locked_at) {
    return { alreadyLocked: true as const };
  }

  await lockScorecardRow(admin, scorecard);

  if (params.roundNo > 0) {
    const { data: siblingRounds, error: sibErr } = await admin
      .from("rounds")
      .select("id")
      .eq("tournament_id", params.tournamentId)
      .eq("round_no", params.roundNo);

    if (sibErr) {
      throw new Error(
        `Error leyendo rondas hermanas: ${supabaseErrText(sibErr)}`
      );
    }

    for (const row of siblingRounds ?? []) {
      const rid = String(row.id ?? "").trim();
      if (!rid || rid === params.roundId) continue;

      const sibling = await getOrCreateScorecardForRound(admin, {
        tournamentId: params.tournamentId,
        roundId: rid,
        entryId: params.entryId,
      });
      await lockScorecardRow(admin, sibling);
    }
  }

  return { alreadyLocked: false as const };
}

async function staffOpenRoundScorecard(
  admin: ReturnType<typeof getAdminClient>,
  params: {
    tournamentId: string;
    roundId: string;
    entryId: string;
    roundNo: number;
  }
) {
  const scorecard = await getOrCreateScorecardForRound(admin, params);

  const roundIdsToOpen = new Set<string>([params.roundId]);
  if (params.roundNo > 0) {
    const { data: siblingRounds, error: sibErr } = await admin
      .from("rounds")
      .select("id")
      .eq("tournament_id", params.tournamentId)
      .eq("round_no", params.roundNo);

    if (sibErr) {
      throw new Error(
        `Error leyendo rondas hermanas: ${supabaseErrText(sibErr)}`
      );
    }

    for (const row of siblingRounds ?? []) {
      const rid = String(row.id ?? "").trim();
      if (rid) roundIdsToOpen.add(rid);
    }
  }

  let anyWasLocked = false;
  const now = new Date().toISOString();

  for (const rid of roundIdsToOpen) {
    const sc =
      rid === params.roundId
        ? scorecard
        : await getOrCreateScorecardForRound(admin, {
            tournamentId: params.tournamentId,
            roundId: rid,
            entryId: params.entryId,
          });

    if (!sc.locked_at) continue;
    anyWasLocked = true;

    const hasSignatures =
      Boolean(sc.player_signed_at) || Boolean(sc.witness_signed_at);
    const nextStatus: ScorecardStatus = hasSignatures
      ? "signed_complete"
      : ((sc.status ?? "draft") as ScorecardStatus);

    const { error: upErr } = await admin
      .from("scorecards")
      .update({
        status: nextStatus,
        locked_at: null,
        updated_at: now,
      })
      .eq("id", sc.id);

    if (upErr) {
      throw new Error(`Error abriendo tarjeta: ${supabaseErrText(upErr)}`);
    }
  }

  return { wasOpen: !anyWasLocked };
}

async function canOverrideLockedScore(tournamentId: string) {
  try {
    await requireTournamentAccess({
      tournamentId,
      allowedRoles: ["super_admin", "club_admin", "tournament_director"],
    });
    return true;
  } catch {
    return false;
  }
}

export async function savePlayerScores(
  _prevState: SaveScoresState,
  formData: FormData
): Promise<SaveScoresState> {
  try {
    const admin = getAdminClient();

    const playerId = String(formData.get("player_id") ?? "").trim();
    const tournamentDayId = String(formData.get("tournament_day_id") ?? "").trim();
    let tournamentId = String(formData.get("tournament_id") ?? "").trim();
    const saveModeRaw = String(formData.get("save_mode") ?? "save").trim();
    const saveMode: SaveScoresSaveMode =
      saveModeRaw === "save_and_close"
        ? "save_and_close"
        : saveModeRaw === "open_round"
          ? "open_round"
          : "save";
    const closeRound = saveMode === "save_and_close";
    const reopenRoundMode = saveMode === "open_round";

    if (!playerId) {
      return { ok: false, message: "Falta player_id" };
    }

    const roundIdHint = String(formData.get("round_id") ?? "").trim();
    if (!tournamentId && roundIdHint) {
      const meta = await getRoundMeta(admin, roundIdHint);
      tournamentId = meta.tournamentId;
    }

    if (!tournamentId) {
      return { ok: false, message: "Falta tournament_id" };
    }

    const { data: fullRoundsEarly, error: fullRoundsEarlyErr } = await admin
      .from("rounds")
      .select(
        "id, tournament_id, category_id, round_no, round_date, start_type, start_time, wave"
      )
      .eq("tournament_id", tournamentId);

    if (fullRoundsEarlyErr) {
      return {
        ok: false,
        message: `Error leyendo rondas: ${fullRoundsEarlyErr.message}`,
      };
    }

    const tournamentRoundsEarly = (fullRoundsEarly ?? []) as SessionRoundFields[];

    function roundFromFormHint(): { roundId: string; roundNo: number } | null {
      if (!roundIdHint) return null;
      const row = tournamentRoundsEarly.find((r) => r.id === roundIdHint);
      if (!row?.id) return null;
      return { roundId: row.id, roundNo: row.round_no };
    }

    const access = await checkTournamentAccess({
      tournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
        "score_capture",
        "marshal",
      ],
    });

    if (!access.ok) {
      return {
        ok: false,
        message: tournamentAccessDeniedMessage(access.reason),
      };
    }

    try {
      const registrationStatus = await fetchTournamentRegistrationStatus(
        admin,
        tournamentId
      );
      assertRegistrationClosedForTeeSheet(registrationStatus);
    } catch (regErr) {
      return {
        ok: false,
        message:
          regErr instanceof Error
            ? regErr.message
            : "Inscripciones abiertas.",
      };
    }

    const entryId = await getEntryIdForTournamentAndPlayer(
      admin,
      tournamentId,
      playerId
    );

    const { data: entryRow, error: entryErr } = await admin
      .from("tournament_entries")
      .select("category_id")
      .eq("id", entryId)
      .maybeSingle();

    if (entryErr) {
      return {
        ok: false,
        message: `Error leyendo inscripción: ${entryErr.message}`,
      };
    }

    const gateCtx = await loadCategoryRoundGateContext(admin, tournamentId);

    const { data: tournamentRow, error: tournamentRowErr } = await admin
      .from("tournaments")
      .select("settings")
      .eq("id", tournamentId)
      .maybeSingle();

    if (tournamentRowErr) {
      return {
        ok: false,
        message: `Error leyendo torneo: ${tournamentRowErr.message}`,
      };
    }

    const tournamentSettings = tournamentRow?.settings ?? null;

    if (reopenRoundMode) {
      const hinted = roundFromFormHint();
      if (!hinted) {
        return {
          ok: false,
          message:
            "No se pudo identificar la ronda a abrir. Vuelve a buscar al jugador.",
        };
      }
      try {
        const openInfo = await staffOpenRoundScorecard(admin, {
          tournamentId,
          roundId: hinted.roundId,
          entryId,
          roundNo: hinted.roundNo,
        });
        await revalidateScoreEntryAndLeaderboard(tournamentId);
        const label = hinted.roundNo > 0 ? `R${hinted.roundNo}` : "La ronda";
        return {
          ok: true,
          saveMode: "open_round",
          message: openInfo.wasOpen
            ? `${label} ya estaba abierta.`
            : `${label} abierta. Corrige los scores y pulsa «Cerrar de nuevo».`,
        };
      } catch (e) {
        return {
          ok: false,
          message:
            e instanceof Error ? e.message : "No se pudo abrir la ronda.",
        };
      }
    }

    const captureRound = await resolveEntryCaptureRound(admin, {
      entryId,
      entryCategoryId: entryRow?.category_id ?? null,
      tournamentId,
      rounds: tournamentRoundsEarly,
      lookups: gateCtx.lookups,
      tournamentSettings,
      sessionRoundId: roundIdHint || null,
    });

    if (!captureRound.ok) {
      if (captureRound.reason === "prior_not_closed") {
        return {
          ok: false,
          message: `No se puede capturar la ronda ${captureRound.targetRoundNo}: el jugador debe tener cerrada la ronda ${captureRound.priorRoundNo} en su categoría.`,
        };
      }
      if (captureRound.reason === "prior_not_officially_closed") {
        return {
          ok: false,
          message: `La R${captureRound.priorRoundNo} debe cerrarse definitivamente en el comité (banner «Cerrar Ronda ${captureRound.priorRoundNo}» en captura) antes de guardar la R${captureRound.targetRoundNo}.`,
        };
      }
      if (captureRound.reason === "all_closed") {
        return {
          ok: false,
          message: `Este jugador ya tiene cerradas todas sus rondas (hasta R${captureRound.lastRoundNo}).`,
        };
      }
      if (captureRound.reason === "no_round") {
        return {
          ok: false,
          message: "No hay ronda configurada para la categoría de este jugador.",
        };
      }
      return {
        ok: false,
        message: "No se pudo resolver la ronda de captura para este jugador.",
      };
    }

    let roundId = captureRound.roundId;
    let roundNo = captureRound.roundNo;
    const hintedRound = roundFromFormHint();
    if (hintedRound) {
      roundId = hintedRound.roundId;
      roundNo = hintedRound.roundNo;
    }

    const tournamentRoundsForAlign = tournamentRoundsEarly;

    const scorecard = await getScorecardForEntryAndRound(
      admin,
      entryId,
      roundId
    );

    const isLocked = Boolean(scorecard?.locked_at);
    const canOverride = isLocked
      ? await canOverrideLockedScore(tournamentId)
      : false;

    if (isLocked && !canOverride) {
      const label = roundNo > 0 ? `R${roundNo}` : "Esta ronda";
      return {
        ok: false,
        message: `${label} cerrada. Usa «Abrir ronda» para corregir scores.`,
      };
    }

    const grossScores: { hole_number: number; strokes: number }[] = [];

    for (let hole = 1; hole <= 18; hole++) {
      const strokes = asInt(formData.get(`hole_${hole}`));

      if (strokes == null) continue;
      if (strokes <= 0) continue;

      if (strokes > 15) {
        return {
          ok: false,
          message: `Score inválido en hoyo ${hole}. Máximo permitido: 15.`,
        };
      }

      grossScores.push({ hole_number: hole, strokes });
    }

    const grossTotal =
      grossScores.length > 0
        ? grossScores.reduce((acc, x) => acc + x.strokes, 0)
        : null;

    const { data: existingRoundScore, error: existingErr } = await admin
      .from("round_scores")
      .select("id")
      .eq("round_id", roundId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existingErr) {
      return {
        ok: false,
        message: `Error buscando round_scores: ${supabaseErrText(existingErr)}`,
      };
    }

    let roundScoreId = existingRoundScore?.id as string | undefined;

    if (!roundScoreId) {
      const { data: inserted, error: insertErr } = await admin
        .from("round_scores")
        .insert({
          round_id: roundId,
          player_id: playerId,
          gross_score: grossTotal,
        })
        .select("id")
        .single();

      if (insertErr) {
        return {
          ok: false,
          message: `Error insertando round_scores: ${supabaseErrText(insertErr)}`,
        };
      }

      roundScoreId = inserted.id;
    } else {
      const { error: updateErr } = await admin
        .from("round_scores")
        .update({
          gross_score: grossTotal,
        })
        .eq("id", roundScoreId);

      if (updateErr) {
        return {
          ok: false,
          message: `Error actualizando round_scores: ${supabaseErrText(updateErr)}`,
        };
      }
    }

    if (!roundScoreId) {
      return {
        ok: false,
        message: "No se pudo determinar el id de round_scores.",
      };
    }

    if (grossScores.length === 0) {
      const { error: deleteAllErr } = await admin
        .from("hole_scores")
        .delete()
        .eq("round_score_id", roundScoreId);

      if (deleteAllErr) {
        return {
          ok: false,
          message: `Error borrando hole_scores: ${supabaseErrText(deleteAllErr)}`,
        };
      }

      const { error: resetTotalErr } = await admin
        .from("round_scores")
        .update({ gross_score: null })
        .eq("id", roundScoreId);

      if (resetTotalErr) {
        return {
          ok: false,
          message: `Error actualizando total de ronda: ${supabaseErrText(resetTotalErr)}`,
        };
      }

      if (closeRound) {
        return {
          ok: false,
          message:
            "No se puede cerrar la ronda sin los 18 hoyos en pantalla. Complete la tarjeta antes de cerrar.",
        };
      }

      await revalidateScoreEntryAndLeaderboard(tournamentId);

      return {
        ok: true,
        saveMode,
        message: canOverride
          ? "Administrador: se limpiaron los scores de una tarjeta cerrada."
          : "Se limpiaron los scores de esta ronda para el jugador.",
      };
    }

    const rows = grossScores.map((x) => ({
      round_score_id: roundScoreId,
      entry_id: entryId,
      round_id: roundId,
      hole_no: x.hole_number,
      hole_number: x.hole_number,
      strokes: x.strokes,
      ...(tournamentDayId ? { tournament_day_id: tournamentDayId } : {}),
    }));

    const { error: deleteExistingErr } = await admin
      .from("hole_scores")
      .delete()
      .eq("round_score_id", roundScoreId);

    if (deleteExistingErr) {
      return {
        ok: false,
        message: `Error borrando hole_scores existentes: ${supabaseErrText(deleteExistingErr)}`,
      };
    }

    const { error: insertErr2 } = await admin
      .from("hole_scores")
      .insert(rows);

    if (insertErr2) {
      return {
        ok: false,
        message: `Error insertando hole_scores: ${supabaseErrText(insertErr2)}`,
      };
    }

    const { error: finalUpdateErr } = await admin
      .from("round_scores")
      .update({
        gross_score: grossTotal,
      })
      .eq("id", roundScoreId);

    if (finalUpdateErr) {
      return {
        ok: false,
        message: `Error actualizando gross_score: ${supabaseErrText(finalUpdateErr)}`,
      };
    }

    try {
      const sync = await syncCaptureToEntryRound(admin, {
        tournamentId,
        entryId,
        playerId,
        sessionRoundId: roundId,
        entryCategoryId: entryRow?.category_id ?? null,
        rounds: tournamentRoundsForAlign ?? [],
      });
      roundId = sync.targetRoundId;
      if (sync.prunedRoundScoreIds.length > 0) {
        console.info(
          "[savePlayerScores] syncCaptureToEntryRound pruned",
          sync.prunedRoundScoreIds.length,
          "misaligned captures for entry",
          entryId
        );
      }
    } catch (syncErr) {
      console.error("[savePlayerScores] syncCaptureToEntryRound:", syncErr);
    }

    if (closeRound) {
      if (grossScores.length < 18) {
        return {
          ok: false,
          message: `No se puede cerrar la ronda: faltan hoyos en pantalla (${grossScores.length}/18).`,
        };
      }

      try {
        const lockInfo = await staffCloseRoundScorecard(admin, {
          tournamentId,
          roundId,
          entryId,
          roundNo,
          playerId,
        });
        await revalidateScoreEntryAndLeaderboard(tournamentId);
        const label = roundNo > 0 ? `R${roundNo}` : "Ronda";
        return {
          ok: true,
          saveMode,
          message: lockInfo.alreadyLocked
            ? `Scores guardados (${grossScores.length} hoyos). Total: ${grossTotal}. ${label} ya estaba cerrada.`
            : `Scores guardados. ${label} cerrada (firmas jugador y testigo). Total: ${grossTotal}. Ya en leaderboard oficial.`,
        };
      } catch (closeErr) {
        return {
          ok: false,
          message:
            closeErr instanceof Error
              ? closeErr.message
              : "No se pudo cerrar la ronda.",
        };
      }
    }

    await revalidateScoreEntryAndLeaderboard(tournamentId);

    return {
      ok: true,
      saveMode,
      message: canOverride
        ? `Administrador: se actualizó una tarjeta cerrada (${grossScores.length} hoyos). Total: ${grossTotal}.`
        : `Scores guardados correctamente (${grossScores.length} hoyos). Total: ${grossTotal}.`,
    };
  } catch (err) {
    console.error("savePlayerScores ERROR:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error inesperado al guardar",
    };
  }
}

/** Reubica capturas mal categorizadas (mismo torneo). Solo staff autorizado. */
export async function repairTournamentCapturesAction(
  _prev: RepairCapturesState,
  formData: FormData
): Promise<RepairCapturesState> {
  try {
    const tournamentId = String(formData.get("tournament_id") ?? "").trim();
    if (!tournamentId) {
      return { ok: false, message: "Falta tournament_id" };
    }

    const access = await checkTournamentAccess({
      tournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
      ],
    });

    if (!access.ok) {
      return {
        ok: false,
        message: tournamentAccessDeniedMessage(access.reason),
      };
    }

    const admin = getAdminClient();
    const result = await repairTournamentRoundAlignment(admin, tournamentId);

    await revalidateScoreEntryAndLeaderboard(tournamentId);

    const errCount =
      result.captures.errors.length +
      result.locks.errors.length +
      result.ghostScorecards.errors.length +
      result.invalidLocks.errors.length;
    const repaired = result.captures.repaired + result.locks.repaired;
    return {
      ok: errCount === 0,
      repaired,
      errors: errCount,
      message: `Reparación terminada: ${repaired} jugadores (${result.captures.repaired} capturas, ${result.locks.repaired} cierres), ${result.invalidLocks.unlocked} cierres inválidos abiertos, ${result.ghostScorecards.scorecardsRemoved} tarjetas fantasma eliminadas, desalineados ${result.misalignedBefore}→${result.misalignedAfter}, ${errCount} errores.`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error en reparación masiva",
    };
  }
}

export type ConfirmRoundCloseState = {
  ok: boolean;
  message: string;
};

function formatTournamentSettingsDbError(message: string): string {
  if (/column\s+["']?settings["']?\s+.*does not exist/i.test(message)) {
    return (
      "Falta la columna tournaments.settings en Supabase. " +
      "Aplica la migración supabase/migrations/20260517130000_tournaments_settings.sql " +
      "(SQL Editor o supabase db push) e intenta de nuevo."
    );
  }
  return message;
}

export async function confirmTournamentRoundClosed(
  _prev: ConfirmRoundCloseState,
  formData: FormData
): Promise<ConfirmRoundCloseState> {
  try {
    const tournamentId = String(formData.get("tournament_id") ?? "").trim();
    const roundNo = Number(formData.get("round_no") ?? "");
    if (!tournamentId) {
      return { ok: false, message: "Falta tournament_id." };
    }
    if (!Number.isFinite(roundNo) || roundNo < 1) {
      return { ok: false, message: "Número de ronda inválido." };
    }

    const access = await checkTournamentAccess({
      tournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
      ],
    });
    if (!access.ok) {
      return {
        ok: false,
        message: tournamentAccessDeniedMessage(access.reason),
      };
    }

    const admin = getAdminClient();
    const gateCtx = await loadCategoryRoundGateContext(admin, tournamentId);

    if (
      !isTournamentRoundReadyToConfirm(
        gateCtx.entries,
        gateCtx.rounds,
        roundNo,
        gateCtx.lookups
      )
    ) {
      return {
        ok: false,
        message: `No se puede cerrar la R${roundNo}: aún hay jugadores sin tarjeta cerrada en alguna categoría.`,
      };
    }

    const { data: tournament, error: tErr } = await admin
      .from("tournaments")
      .select("settings")
      .eq("id", tournamentId)
      .maybeSingle();

    if (tErr || !tournament) {
      return {
        ok: false,
        message: formatTournamentSettingsDbError(
          tErr?.message ?? "No se encontró el torneo."
        ),
      };
    }

    const closedAt = new Date().toISOString();
    const nextSettings = mergeRoundClosure(tournament.settings, roundNo, closedAt);

    const { error: upErr } = await admin
      .from("tournaments")
      .update({ settings: nextSettings })
      .eq("id", tournamentId);

    if (upErr) {
      return {
        ok: false,
        message: formatTournamentSettingsDbError(
          `No se pudo guardar el cierre: ${upErr.message}`
        ),
      };
    }

    await revalidateScoreEntryAndLeaderboard(tournamentId);

    const status = buildTournamentRoundCloseStatus(
      gateCtx.entries,
      gateCtx.rounds,
      roundNo,
      nextSettings,
      gateCtx.lookups
    );

    return {
      ok: true,
      message: status.officiallyClosed
        ? `Ronda ${roundNo} cerrada oficialmente. Ya se puede capturar y publicar la ronda ${roundNo + 1}.`
        : `Ronda ${roundNo} confirmada.`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error al cerrar la ronda.",
    };
  }
}

export type TelegramRecipientReport = {
  role: "player" | "caddie";
  name: string;
  ok: boolean;
  error?: string;
  replacedPrevious: number;
};

export type CloseMatchPlayGroupState = {
  ok: boolean;
  message: string;
  nextRoundNo?: number | null;
  telegram?: {
    sent: number;
    failed: number;
    skipped: number;
    skippedNames: Array<{ role: "player" | "caddie"; name: string }>;
    recipients: TelegramRecipientReport[];
  } | null;
};

/** Cierra las 4 tarjetas del grupo match play y abre la ronda siguiente. */
export async function closeMatchPlayGroupRoundAction(
  _prev: CloseMatchPlayGroupState,
  formData: FormData
): Promise<CloseMatchPlayGroupState> {
  try {
    const tournamentId = String(formData.get("tournament_id") ?? "").trim();
    const groupId = String(formData.get("group_id") ?? "").trim();
    const anchorEntryId = String(formData.get("anchor_entry_id") ?? "").trim();

    if (!tournamentId || !groupId || !anchorEntryId) {
      return { ok: false, message: "Faltan datos del grupo." };
    }

    const access = await checkTournamentAccess({
      tournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
        "score_capture",
        "marshal",
      ],
    });

    if (!access.ok) {
      return {
        ok: false,
        message: tournamentAccessDeniedMessage(access.reason),
      };
    }

    const admin = getAdminClient();
    const { closeMatchPlayGroupRound } = await import(
      "@/lib/score-entry/closeMatchPlayGroupRound"
    );

    const result = await closeMatchPlayGroupRound(
      admin,
      async (client, params) =>
        staffCloseRoundScorecard(client, {
          tournamentId: params.tournamentId,
          roundId: params.roundId,
          entryId: params.entryId,
          roundNo: params.roundNo,
          playerId: params.playerId,
          minHolesRequired: params.minHolesRequired,
        }),
      { tournamentId, groupId, anchorEntryId }
    );

    if (!result.ok) {
      return { ok: false, message: result.error };
    }

    await revalidateScoreEntryAndLeaderboard(tournamentId);

    return {
      ok: true,
      message: result.message,
      nextRoundNo: result.nextRoundNo,
      telegram: result.telegramNotified
        ? {
            sent: result.telegramNotified.sent,
            failed: result.telegramNotified.failed,
            skipped: result.telegramNotified.skipped,
            skippedNames: result.telegramNotified.skippedNames,
            recipients: result.telegramNotified.recipients,
          }
        : null,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error cerrando tarjetas del grupo.",
    };
  }
}