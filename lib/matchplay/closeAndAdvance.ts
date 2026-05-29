import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { deriveMatchHolesFromStrokes } from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import { advanceWinnerInBracket } from "@/lib/matchplay/advanceWinner";

/**
 * Cierra un match (formato Bola Baja + Alta) cuando ya está
 * matemáticamente decidido y avanza al ganador al cuadro:
 *  1. Identifica el `matchplay_matches` real correspondiente al grupo
 *     (mismas 2 parejas en la misma ronda del bracket).
 *  2. Lo marca como `completed` con `winner_pair_id`, `result_text`,
 *     `holes_played`.
 *  3. Llama a `advanceWinnerInBracket` para colocar al ganador en el
 *     siguiente match del cuadro.
 *  4. Si el siguiente match ya quedó con AMBAS parejas asignadas, crea
 *     automáticamente el `pairing_group` + tee time para esa salida
 *     (siguiente ronda del torneo).
 *
 * La función es idempotente: si el match ya está `completed`, sólo
 * recalcula el siguiente paso de salidas si aplica.
 */
export type CloseMatchResult =
  | {
      ok: true;
      matchplayMatchId: string;
      winnerPairId: string | null;
      status: "completed" | "halved";
      advanced: boolean;
      nextMatchId: string | null;
      nextGroupCreated: boolean;
      nextRoundId: string | null;
      nextGroupNo: number | null;
      nextTeeTime: string | null;
      message: string;
    }
  | { ok: false; error: string };

function formatHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseHHMM(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed);
  if (!match) return null;
  const h = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function formatResultText(
  decidedAtHole: number,
  topTotal: number,
  bottomTotal: number,
  viaPlayoff: boolean,
  playoffHole?: number
): string {
  const diff = Math.abs(topTotal - bottomTotal);
  const lead = Number.isInteger(diff)
    ? String(diff)
    : diff.toFixed(1).replace(/\.0$/, "");
  if (viaPlayoff && playoffHole != null) {
    return `Desempate H${playoffHole} · ${lead} arriba`;
  }
  const pointsLeft = Math.max(0, 18 - decidedAtHole) * 2;
  const tail = pointsLeft > 0 ? ` · ${pointsLeft} por jugar` : "";
  return `H${decidedAtHole} · ${lead} arriba${tail}`;
}

export async function closeMatchAndAdvanceForGroup(
  admin: SupabaseClient,
  params: { groupId: string }
): Promise<CloseMatchResult> {
  const groupId = String(params.groupId ?? "").trim();
  if (!groupId) return { ok: false, error: "Falta group_id." };

  // 1) Grupo + ronda + torneo
  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .eq("id", groupId)
    .maybeSingle();
  if (!groupRow?.round_id) {
    return { ok: false, error: "Grupo no encontrado." };
  }
  const roundId = String(groupRow.round_id);
  const groupNo =
    typeof groupRow.group_no === "number" ? groupRow.group_no : null;

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, tournament_id, round_no")
    .eq("id", roundId)
    .maybeSingle();
  if (!roundRow?.tournament_id) {
    return { ok: false, error: "Ronda inválida." };
  }
  const tournamentId = String(roundRow.tournament_id);
  const currentRoundNo = Number(roundRow.round_no ?? 0);

  // 2) Reglas — debe ser Bola Baja + Alta
  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("pair_format")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (rulesRow?.pair_format !== "low_high") {
    return {
      ok: false,
      error: "El torneo no es Match Play Bola Baja + Alta.",
    };
  }

  // 3) Bracket publicado en DB
  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id, status")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bracket?.id) {
    return {
      ok: false,
      error:
        "El torneo no tiene cuadro publicado. Publícalo en /matchplay antes de cerrar partidos automáticamente.",
    };
  }
  const bracketId = String(bracket.id);

  // 4) Derivar la pareja top/bottom del grupo
  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const derivedMatchId = `derived-${roundId}-g${groupNo}`;
  const derivedMatch = derived.matches.find((m) => m.id === derivedMatchId);
  if (
    !derivedMatch ||
    !derivedMatch.top_pair_id ||
    !derivedMatch.bottom_pair_id
  ) {
    return {
      ok: false,
      error: "El grupo no tiene dos parejas asignadas (¿BYE?).",
    };
  }
  const topPairId = derivedMatch.top_pair_id;
  const bottomPairId = derivedMatch.bottom_pair_id;

  // 5) Encontrar el match real (matchplay_matches) por (bracket, round_no,
  //    parejas). Aceptamos cualquier orden top/bottom.
  const { data: candidateMatches } = await admin
    .from("matchplay_matches")
    .select(
      "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, next_match_id"
    )
    .eq("bracket_id", bracketId)
    .eq("round_no", currentRoundNo);

  const realMatch = (candidateMatches ?? []).find(
    (m) =>
      (m.top_pair_id === topPairId && m.bottom_pair_id === bottomPairId) ||
      (m.top_pair_id === bottomPairId && m.bottom_pair_id === topPairId)
  );
  if (!realMatch) {
    return {
      ok: false,
      error: `No se encontró el match del cuadro para R${currentRoundNo} con las parejas de este grupo.`,
    };
  }
  const matchplayMatchId = String(realMatch.id);

  // 6) Re-derivar la decisión a partir de los scores stroke play
  const { decisions } = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    [derivedMatch]
  );
  const decision = decisions.get(derivedMatchId);
  if (!decision) {
    return {
      ok: false,
      error: "El match todavía no está matemáticamente decidido.",
    };
  }

  // Determinar el ganador real en términos de pair_id (no derived "top/bottom").
  const derivedWinnerPairId =
    decision.winner === "top" ? topPairId : bottomPairId;

  // En matchplay_matches el "lado" puede estar invertido respecto al
  // derived; eso es OK porque guardamos winner_pair_id directamente.
  const winnerPairId = derivedWinnerPairId;

  // 7) Idempotencia: si ya está completado con este ganador, sólo
  //    reintentamos el paso 8/9.
  let alreadyCompleted = false;
  if (
    realMatch.status === "completed" &&
    realMatch.winner_pair_id === winnerPairId
  ) {
    alreadyCompleted = true;
  } else if (realMatch.status === "completed") {
    return {
      ok: false,
      error:
        "El match ya está cerrado con un ganador distinto. Reabre el cuadro desde /matchplay si es necesario.",
    };
  }

  const holesPlayed = decision.via_playoff
    ? 18 + Number(decision.playoff_hole ?? 0)
    : decision.decided_at_hole;
  const resultText = formatResultText(
    decision.decided_at_hole,
    decision.top_total,
    decision.bottom_total,
    Boolean(decision.via_playoff),
    decision.playoff_hole
  );

  if (!alreadyCompleted) {
    const { error: updErr } = await admin
      .from("matchplay_matches")
      .update({
        winner_pair_id: winnerPairId,
        status: "completed",
        result_text: resultText,
        holes_played: holesPlayed,
        updated_at: new Date().toISOString(),
      })
      .eq("id", matchplayMatchId);
    if (updErr) {
      return { ok: false, error: `Error cerrando match: ${updErr.message}` };
    }
  }

  // 8) Avanzar al ganador
  const adv = await advanceWinnerInBracket(admin, {
    match_id: matchplayMatchId,
    winner_pair_id: winnerPairId,
  });

  let nextGroupCreated = false;
  let nextGroupNo: number | null = null;
  let nextRoundId: string | null = null;
  let nextTeeTime: string | null = null;

  if (adv.advanced && adv.next_match_id) {
    // 9) Si el siguiente match ya tiene AMBAS parejas, crear la salida.
    const created = await maybeCreateNextRoundGroup(admin, {
      tournamentId,
      nextMatchId: adv.next_match_id,
      currentRoundNo,
    });
    if (created.ok) {
      nextGroupCreated = created.created;
      nextGroupNo = created.groupNo;
      nextRoundId = created.roundId;
      nextTeeTime = created.teeTime;
    }
  }

  const advanceMessage = adv.advanced
    ? adv.message
    : "Sin partido siguiente (campeón) o BYE.";

  return {
    ok: true,
    matchplayMatchId,
    winnerPairId,
    status: "completed",
    advanced: adv.advanced,
    nextMatchId: adv.next_match_id ?? null,
    nextGroupCreated,
    nextRoundId,
    nextGroupNo,
    nextTeeTime,
    message: nextGroupCreated
      ? `${advanceMessage} Salida creada (G${nextGroupNo} · ${nextTeeTime}).`
      : advanceMessage,
  };
}

/**
 * Si el match siguiente ya tiene ambas parejas, intenta crear el
 * `pairing_group` para la ronda del torneo correspondiente. La ronda
 * destino se identifica por `rounds.round_no = nextMatch.round_no`.
 *
 * Reglas:
 *  - Si ya existe un grupo en esa ronda con `group_no = position_no`,
 *    sólo actualiza sus miembros (no duplica).
 *  - Si la ronda destino no existe en `rounds`, no falla — sólo
 *    reporta `created: false`.
 *  - El `tee_time` usa `rounds.start_time` + (position_no - 1) ·
 *    `interval_minutes` (default 10).
 */
async function maybeCreateNextRoundGroup(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    nextMatchId: string;
    currentRoundNo: number;
  }
): Promise<{
  ok: boolean;
  created: boolean;
  groupNo: number | null;
  roundId: string | null;
  teeTime: string | null;
}> {
  const { data: nextMatch } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, status"
    )
    .eq("id", params.nextMatchId)
    .maybeSingle();
  if (!nextMatch) {
    return { ok: false, created: false, groupNo: null, roundId: null, teeTime: null };
  }
  if (!nextMatch.top_pair_id || !nextMatch.bottom_pair_id) {
    // Esperando a la otra pareja. No creamos salida todavía.
    return { ok: true, created: false, groupNo: null, roundId: null, teeTime: null };
  }
  if (nextMatch.status === "bye" || nextMatch.status === "walkover") {
    // No requiere salida — quien tiene pareja avanza automáticamente.
    return { ok: true, created: false, groupNo: null, roundId: null, teeTime: null };
  }

  // Ronda destino en el calendario del torneo
  const nextRoundNo = Number(nextMatch.round_no);
  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes")
    .eq("tournament_id", params.tournamentId)
    .eq("round_no", nextRoundNo)
    .maybeSingle();
  if (!roundRow?.id) {
    // Aún no hay ronda creada para la siguiente fase.
    return { ok: true, created: false, groupNo: null, roundId: null, teeTime: null };
  }
  const nextRoundId = String(roundRow.id);

  const baseMinutes = roundRow.start_time
    ? parseHHMM(String(roundRow.start_time))
    : null;
  const interval =
    typeof roundRow.interval_minutes === "number" &&
    roundRow.interval_minutes > 0
      ? Math.trunc(roundRow.interval_minutes)
      : 10;

  const positionNo = Number(nextMatch.position_no ?? 1);
  // group_no = position_no para mantener la convención del bracket
  const groupNo = positionNo;
  const teeTime =
    baseMinutes != null ? formatHHMM(baseMinutes + (groupNo - 1) * interval) : null;

  // Cargar parejas (ya completas) para sacar entries
  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, seed")
    .in("id", [nextMatch.top_pair_id, nextMatch.bottom_pair_id]);
  const topPair = (pairs ?? []).find((p) => p.id === nextMatch.top_pair_id);
  const botPair = (pairs ?? []).find(
    (p) => p.id === nextMatch.bottom_pair_id
  );
  if (!topPair || !botPair) {
    return { ok: false, created: false, groupNo: null, roundId: null, teeTime: null };
  }

  const entryIds: string[] = [
    topPair.player_a_entry_id,
    topPair.player_b_entry_id,
    botPair.player_a_entry_id,
    botPair.player_b_entry_id,
  ].filter((v): v is string => !!v);

  const topLabel = topPair.seed != null ? `#${topPair.seed}` : "TOP";
  const botLabel = botPair.seed != null ? `#${botPair.seed}` : "BOT";
  const notes = `MATCH PLAY · ${topLabel} vs ${botLabel}`;

  // ¿Ya existe un grupo con ese group_no en la ronda destino?
  const { data: existing } = await admin
    .from("pairing_groups")
    .select("id")
    .eq("round_id", nextRoundId)
    .eq("group_no", groupNo)
    .maybeSingle();

  let groupRecordId: string;
  let created = false;
  if (existing?.id) {
    groupRecordId = String(existing.id);
    if (teeTime) {
      await admin
        .from("pairing_groups")
        .update({ tee_time: teeTime, notes })
        .eq("id", groupRecordId);
    }
    // Reemplazamos miembros para reflejar las parejas actuales.
    await admin
      .from("pairing_group_members")
      .delete()
      .eq("group_id", groupRecordId);
  } else {
    const { data: inserted, error: insErr } = await admin
      .from("pairing_groups")
      .insert({
        round_id: nextRoundId,
        group_no: groupNo,
        tee_time: teeTime ?? null,
        starting_hole: null,
        notes,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return { ok: false, created: false, groupNo, roundId: nextRoundId, teeTime };
    }
    groupRecordId = String(inserted.id);
    created = true;
  }

  if (entryIds.length > 0) {
    const members = entryIds.map((entry_id, idx) => ({
      group_id: groupRecordId,
      entry_id,
      position: idx + 1,
    }));
    await admin.from("pairing_group_members").insert(members);
  }

  return {
    ok: true,
    created,
    groupNo,
    roundId: nextRoundId,
    teeTime,
  };
}
