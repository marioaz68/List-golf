import type { SupabaseClient } from "@supabase/supabase-js";
import { getRoundForCategory, type RoundForGate } from "@/lib/rounds/categoryRoundGate";
import { MIN_HOLES_TO_LOCK_SCORECARD } from "@/lib/scorecards/countHolesOnPlayerRound";

function holeNoFromRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

export type MoveCaptureBetweenRoundNosResult = {
  entryId: string;
  playerId: string;
  playerNumber: number | null;
  fromRoundId: string;
  toRoundId: string;
  holesMoved: number;
  grossTotal: number;
  removedFromRoundScoreId: string | null;
  targetRoundScoreId: string;
  toScorecardLocked: boolean;
  fromScorecardRemoved: boolean;
};

/**
 * Mueve captura (hole_scores + gross) entre dos round_no de la misma categoría del inscrito.
 * Elimina la tarjeta cerrada en la ronda origen para poder volver a capturar ahí después.
 */
export async function moveCaptureBetweenRoundNos(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    entryId: string;
    playerId: string;
    fromRoundNo: number;
    toRoundNo: number;
    lockTargetScorecard?: boolean;
  }
): Promise<MoveCaptureBetweenRoundNosResult> {
  const {
    tournamentId,
    entryId,
    playerId,
    fromRoundNo,
    toRoundNo,
    lockTargetScorecard = true,
  } = params;

  const { data: entry, error: entryErr } = await admin
    .from("tournament_entries")
    .select("id, player_id, player_number, category_id")
    .eq("id", entryId)
    .maybeSingle();

  if (entryErr || !entry) {
    throw new Error(`Inscripción no encontrada: ${entryErr?.message ?? ""}`);
  }

  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id, round_no, category_id")
    .eq("tournament_id", tournamentId);

  if (roundsErr) {
    throw new Error(`Error leyendo rondas: ${roundsErr.message}`);
  }

  const roundList = (rounds ?? []) as RoundForGate[];
  const categoryId = entry.category_id as string | null;

  const fromRound = getRoundForCategory(roundList, fromRoundNo, categoryId);
  const toRound = getRoundForCategory(roundList, toRoundNo, categoryId);

  if (!fromRound?.id || !toRound?.id) {
    throw new Error(
      `Faltan filas rounds para categoría del inscrito (R${fromRoundNo} / R${toRoundNo}).`
    );
  }

  const { data: sourceRs, error: srcErr } = await admin
    .from("round_scores")
    .select("id, gross_score")
    .eq("player_id", playerId)
    .eq("round_id", fromRound.id)
    .maybeSingle();

  if (srcErr) {
    throw new Error(`Error leyendo captura origen: ${srcErr.message}`);
  }
  if (!sourceRs?.id) {
    throw new Error(`No hay captura en R${fromRoundNo} para mover.`);
  }

  const { data: sourceHoles, error: holesErr } = await admin
    .from("hole_scores")
    .select("hole_number, hole_no, strokes")
    .eq("round_score_id", sourceRs.id);

  if (holesErr) {
    throw new Error(`Error leyendo hoyos origen: ${holesErr.message}`);
  }

  const holeRows: Array<{ hole_number: number; strokes: number }> = [];

  for (const row of sourceHoles ?? []) {
    const holeNo = holeNoFromRow(row);
    if (holeNo == null || row.strokes == null) continue;
    const strokes = Number(row.strokes);
    if (!Number.isFinite(strokes) || strokes <= 0) continue;
    holeRows.push({ hole_number: holeNo, strokes });
  }

  if (holeRows.length < MIN_HOLES_TO_LOCK_SCORECARD) {
    throw new Error(
      `La captura en R${fromRoundNo} tiene ${holeRows.length} hoyos; se requieren ${MIN_HOLES_TO_LOCK_SCORECARD}.`
    );
  }

  const grossTotal = holeRows.reduce((acc, h) => acc + h.strokes, 0);

  let { data: targetRs } = await admin
    .from("round_scores")
    .select("id")
    .eq("player_id", playerId)
    .eq("round_id", toRound.id)
    .maybeSingle();

  if (!targetRs?.id) {
    const { data: inserted, error: insErr } = await admin
      .from("round_scores")
      .insert({
        round_id: toRound.id,
        player_id: playerId,
        gross_score: grossTotal,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      throw new Error(
        `Error creando round_scores destino: ${insErr?.message ?? ""}`
      );
    }
    targetRs = inserted;
  } else {
    const { error: upErr } = await admin
      .from("round_scores")
      .update({ gross_score: grossTotal })
      .eq("id", targetRs.id);

    if (upErr) {
      throw new Error(`Error actualizando gross destino: ${upErr.message}`);
    }

    await admin.from("hole_scores").delete().eq("round_score_id", targetRs.id);
  }

  const targetRsId = targetRs.id;

  const { error: insertErr } = await admin.from("hole_scores").insert(
    holeRows.map((h) => ({
      round_score_id: targetRsId,
      entry_id: entryId,
      round_id: toRound.id,
      hole_no: h.hole_number,
      hole_number: h.hole_number,
      strokes: h.strokes,
    }))
  );

  if (insertErr) {
    throw new Error(`Error insertando hoyos en R${toRoundNo}: ${insertErr.message}`);
  }

  await admin.from("hole_scores").delete().eq("round_score_id", sourceRs.id);
  await admin.from("round_scores").delete().eq("id", sourceRs.id);

  const { error: delFromSc } = await admin
    .from("scorecards")
    .delete()
    .eq("entry_id", entryId)
    .eq("round_id", fromRound.id);

  if (delFromSc) {
    throw new Error(`Error eliminando tarjeta R${fromRoundNo}: ${delFromSc.message}`);
  }

  let toScorecardLocked = false;
  if (lockTargetScorecard) {
    const now = new Date().toISOString();
    const { data: existingToSc } = await admin
      .from("scorecards")
      .select("id, locked_at")
      .eq("entry_id", entryId)
      .eq("round_id", toRound.id)
      .maybeSingle();

    if (existingToSc?.id) {
      const { error: lockErr } = await admin
        .from("scorecards")
        .update({
          locked_at: existingToSc.locked_at ?? now,
          status: "locked",
          updated_at: now,
        })
        .eq("id", existingToSc.id);

      if (lockErr) {
        throw new Error(`Error cerrando tarjeta R${toRoundNo}: ${lockErr.message}`);
      }
    } else {
      const { error: insScErr } = await admin.from("scorecards").insert({
        tournament_id: tournamentId,
        entry_id: entryId,
        round_id: toRound.id,
        status: "locked",
        locked_at: now,
        player_signed_at: now,
        witness_signed_at: now,
        updated_at: now,
      });

      if (insScErr) {
        throw new Error(`Error creando tarjeta R${toRoundNo}: ${insScErr.message}`);
      }
    }
    toScorecardLocked = true;
  }

  return {
    entryId,
    playerId,
    playerNumber: entry.player_number,
    fromRoundId: fromRound.id,
    toRoundId: toRound.id,
    holesMoved: holeRows.length,
    grossTotal,
    removedFromRoundScoreId: sourceRs.id,
    targetRoundScoreId: targetRsId,
    toScorecardLocked,
    fromScorecardRemoved: true,
  };
}
