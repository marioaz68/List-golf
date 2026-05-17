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
import { syncCaptureToEntryRound } from "@/lib/scorecards/syncCaptureToEntryRound";
import { loadCategoryRoundGateContext } from "@/lib/rounds/loadCategoryRoundGate";
import { repairMisalignedCapturesForTournament } from "@/lib/scorecards/repairMisalignedCapturesForTournament";
import type { SessionRoundFields } from "@/app/(backoffice)/tee-sheet/sessionBlock";
import { resolveEntryCaptureRound } from "@/lib/rounds/resolveEntryCaptureRound";
import {
  assertRegistrationClosedForTeeSheet,
  fetchTournamentRegistrationStatus,
} from "@/lib/tournaments/registrationGate";

export type SaveScoresState = {
  ok: boolean;
  message: string;
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

async function countHoleScoresForPlayerRound(
  admin: ReturnType<typeof getAdminClient>,
  roundId: string,
  playerId: string
): Promise<number> {
  const { data: rs, error: rsErr } = await admin
    .from("round_scores")
    .select("id")
    .eq("round_id", roundId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (rsErr || !rs?.id) return 0;

  const { count, error: hsErr } = await admin
    .from("hole_scores")
    .select("id", { count: "exact", head: true })
    .eq("round_score_id", rs.id);

  if (hsErr) return 0;
  return count ?? 0;
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
  }
) {
  await alignCaptureToScorecardRound(admin, {
    tournamentId: params.tournamentId,
    entryId: params.entryId,
    playerId: params.playerId,
    scorecardRoundId: params.roundId,
  });

  const holeCount = await countHoleScoresForPlayerRound(
    admin,
    params.roundId,
    params.playerId
  );

  if (holeCount < 18) {
    throw new Error(
      `No se puede cerrar la ronda: faltan hoyos (${holeCount}/18). Complete la tarjeta o use solo «Guardar scores».`
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
    const saveMode = String(formData.get("save_mode") ?? "save").trim();
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

    const access = await checkTournamentAccess({
      tournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
        "score_capture",
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

    const { data: fullRounds, error: fullRoundsErr } = await admin
      .from("rounds")
      .select(
        "id, tournament_id, category_id, round_no, round_date, start_type, start_time, wave"
      )
      .eq("tournament_id", tournamentId);

    if (fullRoundsErr) {
      return {
        ok: false,
        message: `Error leyendo rondas: ${fullRoundsErr.message}`,
      };
    }

    const captureRound = await resolveEntryCaptureRound(admin, {
      entryId,
      entryCategoryId: entryRow?.category_id ?? null,
      tournamentId,
      rounds: (fullRounds ?? []) as SessionRoundFields[],
      lookups: gateCtx.lookups,
    });

    if (!captureRound.ok) {
      if (captureRound.reason === "prior_not_closed") {
        return {
          ok: false,
          message: `No se puede capturar la ronda ${captureRound.targetRoundNo}: el jugador debe tener cerrada la ronda ${captureRound.priorRoundNo} en su categoría.`,
        };
      }
      if (captureRound.reason === "all_closed") {
        return {
          ok: false,
          message: `Este jugador ya tiene cerradas todas sus rondas (hasta R${captureRound.lastRoundNo}).`,
        };
      }
      return {
        ok: false,
        message: "No hay ronda configurada para la categoría de este jugador.",
      };
    }

    let roundId = captureRound.roundId;
    let roundNo = captureRound.roundNo;

    const { data: tournamentRoundsForAlign, error: trAlignErr } = await admin
      .from("rounds")
      .select(
        "id, tournament_id, round_no, round_date, category_id, start_type, start_time, wave"
      )
      .eq("tournament_id", tournamentId);

    if (trAlignErr) {
      return {
        ok: false,
        message: `Error leyendo rondas del torneo: ${trAlignErr.message}`,
      };
    }

    if (reopenRoundMode) {
      try {
        const openInfo = await staffOpenRoundScorecard(admin, {
          tournamentId,
          roundId,
          entryId,
          roundNo,
        });
        await revalidateScoreEntryAndLeaderboard(tournamentId);
        const label = roundNo > 0 ? `R${roundNo}` : "La ronda";
        return {
          ok: true,
          message: openInfo.wasOpen
            ? `${label} ya estaba abierta.`
            : `${label} abierta. Puedes corregir scores y volver a cerrar.`,
        };
      } catch (e) {
        return {
          ok: false,
          message:
            e instanceof Error ? e.message : "No se pudo abrir la ronda.",
        };
      }
    }

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
    const result = await repairMisalignedCapturesForTournament(
      admin,
      tournamentId
    );

    await revalidateScoreEntryAndLeaderboard(tournamentId);

    const errCount = result.errors.length;
    return {
      ok: errCount === 0,
      repaired: result.repaired,
      errors: errCount,
      message: `Reparación terminada: ${result.repaired} jugadores realineados, ${result.skipped} sin cambios, ${errCount} errores.`,
    };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error en reparación masiva",
    };
  }
}