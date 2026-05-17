import type { SupabaseClient } from "@supabase/supabase-js";

function holeNoFromRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

/**
 * Si la captura quedó en otro `round_id` (misma ronda lógica / sesión),
 * copia hoyos al `round_id` de la tarjeta para que firma y leaderboard coincidan.
 */
export async function alignCaptureToScorecardRound(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    entryId: string;
    playerId: string;
    scorecardRoundId: string;
  }
): Promise<{ aligned: boolean; holesCopied: number }> {
  const { tournamentId, entryId, playerId, scorecardRoundId } = params;

  const { data: targetRound, error: roundErr } = await admin
    .from("rounds")
    .select("id, round_no, tournament_id")
    .eq("id", scorecardRoundId)
    .maybeSingle();

  if (roundErr || !targetRound?.id) {
    throw new Error(
      `No se pudo leer la ronda de la tarjeta: ${roundErr?.message ?? "sin datos"}`
    );
  }

  if (String(targetRound.tournament_id) !== tournamentId) {
    throw new Error("La ronda de la tarjeta no pertenece al torneo.");
  }

  const { data: tournamentRounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id, round_no")
    .eq("tournament_id", tournamentId);

  if (roundsErr) {
    throw new Error(`Error leyendo rondas del torneo: ${roundsErr.message}`);
  }

  const roundIdsSameNo = (tournamentRounds ?? [])
    .filter((r) => Number(r.round_no) === Number(targetRound.round_no))
    .map((r) => String(r.id));

  const roundIdsToSearch = Array.from(
    new Set([scorecardRoundId, ...roundIdsSameNo])
  );

  const { data: roundScores, error: rsErr } = await admin
    .from("round_scores")
    .select("id, round_id, gross_score")
    .eq("player_id", playerId)
    .in("round_id", roundIdsToSearch);

  if (rsErr) {
    throw new Error(`Error leyendo round_scores: ${rsErr.message}`);
  }

  const rows = roundScores ?? [];
  if (rows.length === 0) {
    return { aligned: false, holesCopied: 0 };
  }

  let targetRs =
    rows.find((r) => String(r.round_id) === scorecardRoundId) ?? null;

  const { data: allHoleScores, error: hsErr } = await admin
    .from("hole_scores")
    .select("round_score_id, hole_number, hole_no, strokes")
    .in(
      "round_score_id",
      rows.map((r) => r.id)
    );

  if (hsErr) {
    throw new Error(`Error leyendo hole_scores: ${hsErr.message}`);
  }

  const holesByRs = new Map<
    string,
    Array<{ hole_number: number; strokes: number }>
  >();

  for (const row of allHoleScores ?? []) {
    const holeNo = holeNoFromRow(row);
    if (holeNo == null || row.strokes == null) continue;
    const strokes = Number(row.strokes);
    if (!Number.isFinite(strokes) || strokes <= 0) continue;

    const list = holesByRs.get(row.round_score_id) ?? [];
    const existing = list.find((h) => h.hole_number === holeNo);
    if (existing) {
      existing.strokes = strokes;
    } else {
      list.push({ hole_number: holeNo, strokes });
    }
    holesByRs.set(row.round_score_id, list);
  }

  const countHoles = (rsId: string) => holesByRs.get(rsId)?.length ?? 0;

  let sourceRsId: string | null = null;
  let bestCount = targetRs ? countHoles(targetRs.id) : 0;

  for (const rs of rows) {
    const c = countHoles(rs.id);
    if (c > bestCount) {
      bestCount = c;
      sourceRsId = rs.id;
    }
  }

  if (!sourceRsId || bestCount === 0) {
    return { aligned: false, holesCopied: 0 };
  }

  if (targetRs && sourceRsId === targetRs.id) {
    return { aligned: true, holesCopied: bestCount };
  }

  const sourceHoles = holesByRs.get(sourceRsId) ?? [];
  if (sourceHoles.length === 0) {
    return { aligned: false, holesCopied: 0 };
  }

  const sourceRow = rows.find((r) => r.id === sourceRsId)!;
  const grossTotal = sourceHoles.reduce((acc, h) => acc + h.strokes, 0);

  if (!targetRs) {
    const { data: inserted, error: insErr } = await admin
      .from("round_scores")
      .insert({
        round_id: scorecardRoundId,
        player_id: playerId,
        gross_score: grossTotal,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      throw new Error(
        `Error creando round_scores en ronda de tarjeta: ${insErr?.message ?? ""}`
      );
    }
    targetRs = { id: inserted.id, round_id: scorecardRoundId, gross_score: grossTotal };
  } else {
    const { error: upErr } = await admin
      .from("round_scores")
      .update({ gross_score: grossTotal })
      .eq("id", targetRs.id);

    if (upErr) {
      throw new Error(`Error actualizando gross en ronda de tarjeta: ${upErr.message}`);
    }
  }

  const targetRsId = targetRs.id;

  await admin.from("hole_scores").delete().eq("round_score_id", targetRsId);

  const insertRows = sourceHoles.map((h) => ({
    round_score_id: targetRsId,
    entry_id: entryId,
    round_id: scorecardRoundId,
    hole_no: h.hole_number,
    hole_number: h.hole_number,
    strokes: h.strokes,
  }));

  const { error: insertErr } = await admin.from("hole_scores").insert(insertRows);

  if (insertErr) {
    throw new Error(
      `Error copiando hoyos a la ronda de la tarjeta: ${insertErr.message}`
    );
  }

  if (String(sourceRow.round_id) !== scorecardRoundId) {
    console.info(
      "[alignCaptureToScorecardRound]",
      `Copiados ${sourceHoles.length} hoyos de round ${sourceRow.round_id} → ${scorecardRoundId} (jugador ${playerId})`
    );
  }

  return { aligned: true, holesCopied: sourceHoles.length };
}
