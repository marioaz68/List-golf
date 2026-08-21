import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ensureMatchPlayCalendarRounds,
  findLastMainRound,
} from "@/lib/matchplay/ensureMatchPlayCalendarRounds";
import { isPlayablePairTeam } from "@/lib/matchplay/playablePairTeam";
import { confirmStartingOrderForRound } from "@/lib/matchplay/confirmMatchPlaySalidasPublished";

/**
 * Si el match siguiente del cuadro ya tiene AMBAS parejas asignadas,
 * crea (o actualiza) el `pairing_group` para la ronda del torneo
 * correspondiente. Es la pieza que permite que las "salidas" de R2, R3,
 * …, final aparezcan automáticamente conforme se van cerrando partidos
 * en la ronda anterior — sin esperar a que el comité genere salidas a
 * mano y aunque la ronda apenas tenga 1 ó 2 enfrentamientos definidos.
 *
 * Reglas:
 *  - Identifica la ronda destino por `rounds.round_no = nextMatch.round_no`
 *    (mismo torneo). Si esa ronda no existe en `rounds`, no falla — sólo
 *    reporta `created: false`.
 *  - `group_no = nextMatch.position_no` para mantener la convención del
 *    cuadro USGA y ordenar las salidas igual que el bracket.
 *  - `tee_time` = `rounds.start_time` + (group_no - 1) · `interval_minutes`
 *    (default 10 min si no hay configurado).
 *  - Idempotente: si ya existe un `pairing_group` con ese `group_no` en
 *    la ronda destino, reemplaza miembros y actualiza tee_time/notes en
 *    lugar de duplicar.
 *  - Salta cuando el siguiente match aún espera al otro ganador, es BYE
 *    o walkover.
 */
export type MaybeCreateNextRoundGroupResult = {
  ok: boolean;
  created: boolean;
  /** Solo true cuando se ACTUALIZÓ una salida existente (vs created nueva). */
  updated?: boolean;
  groupNo: number | null;
  roundId: string | null;
  teeTime: string | null;
  reason?:
    | "next_match_missing"
    | "waiting_other_pair"
    | "bye_or_walkover"
    | "round_not_in_calendar"
    | "pairs_missing"
    | "pairs_incomplete"
    | "insert_failed";
};

function formatHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function parseHHMM(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  const match = /^(\d{1,2}):(\d{2})/.exec(trimmed);
  if (!match) return null;
  const h = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

export async function maybeCreateNextRoundGroup(
  admin: SupabaseClient,
  params: { tournamentId: string; nextMatchId: string }
): Promise<MaybeCreateNextRoundGroupResult> {
  const { data: nextMatch } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, status"
    )
    .eq("id", params.nextMatchId)
    .maybeSingle();

  if (!nextMatch) {
    return {
      ok: false,
      created: false,
      groupNo: null,
      roundId: null,
      teeTime: null,
      reason: "next_match_missing",
    };
  }
  if (!nextMatch.top_pair_id || !nextMatch.bottom_pair_id) {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: null,
      teeTime: null,
      reason: "waiting_other_pair",
    };
  }
  if (nextMatch.status === "bye" || nextMatch.status === "walkover") {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: null,
      teeTime: null,
      reason: "bye_or_walkover",
    };
  }

  const nextRoundNo = Number(nextMatch.round_no);
  let { data: roundRow } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes")
    .eq("tournament_id", params.tournamentId)
    .eq("round_no", nextRoundNo)
    .maybeSingle();
  if (!roundRow?.id) {
    try {
      await ensureMatchPlayCalendarRounds(admin, params.tournamentId);
      const retry = await admin
        .from("rounds")
        .select("id, start_time, interval_minutes")
        .eq("tournament_id", params.tournamentId)
        .eq("round_no", nextRoundNo)
        .maybeSingle();
      roundRow = retry.data;
    } catch (err) {
      console.error(
        "[maybeCreateNextRoundGroup] ensureMatchPlayCalendarRounds:",
        err
      );
    }
  }
  if (!roundRow?.id) {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: null,
      teeTime: null,
      reason: "round_not_in_calendar",
    };
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
  const lastMain = await findLastMainRound(admin, params.tournamentId);
  const lastRoundNo = Number(lastMain?.round_no ?? 0);
  const { data: consolOnRound } = await admin
    .from("pairing_groups")
    .select("id, notes")
    .eq("round_id", nextRoundId);
  const consolCount = (consolOnRound ?? []).filter((g) =>
    String(g.notes ?? "").startsWith("CONSOLACIÓN MP · ")
  ).length;

  // Domingo R6: consolación (si ya está) · 3er/4to · final.
  let groupNo = consolCount + positionNo;
  if (lastRoundNo > 0 && nextRoundNo === lastRoundNo) {
    if (positionNo === 2) groupNo = consolCount + 1;
    else if (positionNo === 1) groupNo = consolCount + 2;
  }
  const teeTime =
    baseMinutes != null
      ? formatHHMM(baseMinutes + (groupNo - 1) * interval)
      : null;

  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, seed, is_active")
    .in("id", [nextMatch.top_pair_id, nextMatch.bottom_pair_id]);
  const topPair = (pairs ?? []).find((p) => p.id === nextMatch.top_pair_id);
  const botPair = (pairs ?? []).find((p) => p.id === nextMatch.bottom_pair_id);
  if (!topPair || !botPair) {
    return {
      ok: false,
      created: false,
      groupNo,
      roundId: nextRoundId,
      teeTime,
      reason: "pairs_missing",
    };
  }
  if (!isPlayablePairTeam(topPair) || !isPlayablePairTeam(botPair)) {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: nextRoundId,
      teeTime,
      reason: "waiting_other_pair",
    };
  }

  const entryIds: string[] = [
    topPair.player_a_entry_id,
    topPair.player_b_entry_id,
    botPair.player_a_entry_id,
    botPair.player_b_entry_id,
  ].filter((v): v is string => !!v);
  if (entryIds.length < 4) {
    return {
      ok: true,
      created: false,
      groupNo: null,
      roundId: nextRoundId,
      teeTime,
      reason: "pairs_incomplete",
    };
  }

  const topLabel = topPair.seed != null ? `#${topPair.seed}` : "TOP";
  const botLabel = botPair.seed != null ? `#${botPair.seed}` : "BOT";
  const notes = `MATCH PLAY · ${topLabel} vs ${botLabel}`;

  // Preferir grupo ya ligado a ESTE enfrentamiento (notas con ambos seeds).
  // No reutilizar group_no=position_no si ese slot ya es otro partido
  // (p. ej. R3 con extraordinaria en G1: pos 3 ≠ G3 de #25 vs #24).
  const { data: roundGroups } = await admin
    .from("pairing_groups")
    .select("id, group_no, tee_time, notes")
    .eq("round_id", nextRoundId);

  const notesMatch = (roundGroups ?? []).find((g) => {
    const n = String(g.notes ?? "");
    return (
      n.includes(`${topLabel} vs ${botLabel}`) ||
      n.includes(`${botLabel} vs ${topLabel}`)
    );
  });

  let groupRecordId: string;
  let created = false;
  let updated = false;
  // Tee efectivo: no pisar horarios que el comité ya ajustó en salidas
  // (p. ej. ola de 11:00 + extraordinaria a las 07:00). Solo asignar
  // fórmula al crear el grupo o si aún no tiene tee_time.
  let effectiveTeeTime = teeTime;
  let effectiveGroupNo = groupNo;
  if (notesMatch?.id) {
    groupRecordId = String(notesMatch.id);
    effectiveGroupNo =
      typeof notesMatch.group_no === "number"
        ? notesMatch.group_no
        : groupNo;
    const kept = String(notesMatch.tee_time ?? "").trim() || null;
    if (kept) effectiveTeeTime = kept.slice(0, 8);
    await admin
      .from("pairing_groups")
      .update({
        ...(kept ? {} : { tee_time: teeTime ?? null }),
        notes,
      })
      .eq("id", groupRecordId);
    await admin
      .from("pairing_group_members")
      .delete()
      .eq("group_id", groupRecordId);
    updated = true;
  } else {
    // Grupo nuevo: si la ronda ya tiene salidas, encolar después del
    // último tee (evita 07:00+(n-1)·iv cuando start_time es la extra).
    // Si group_no=position_no ya está ocupado por otro partido, usar max+1.
    const peerMins = (roundGroups ?? [])
      .map((g) => parseHHMM(String(g.tee_time ?? "")))
      .filter((n): n is number => n != null);
    if (peerMins.length > 0) {
      effectiveTeeTime = formatHHMM(Math.max(...peerMins) + interval);
    }
    const takenNos = new Set(
      (roundGroups ?? []).map((g) => Number(g.group_no)).filter(Number.isFinite)
    );
    if (takenNos.has(effectiveGroupNo)) {
      effectiveGroupNo = Math.max(0, ...takenNos) + 1;
    }
    const { data: inserted, error: insErr } = await admin
      .from("pairing_groups")
      .insert({
        round_id: nextRoundId,
        group_no: effectiveGroupNo,
        tee_time: effectiveTeeTime ?? null,
        starting_hole: null,
        notes,
      })
      .select("id")
      .single();
    if (insErr || !inserted) {
      return {
        ok: false,
        created: false,
        groupNo: effectiveGroupNo,
        roundId: nextRoundId,
        teeTime: effectiveTeeTime,
        reason: "insert_failed",
      };
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

  // Visible en página pública sin paso manual de "confirmar orden".
  try {
    await confirmStartingOrderForRound(admin, nextRoundId);
  } catch (err) {
    console.error(
      `[maybeCreateNextRoundGroup] publish R${nextRoundNo}:`,
      err
    );
  }

  return {
    ok: true,
    created,
    updated,
    groupNo: effectiveGroupNo,
    roundId: nextRoundId,
    teeTime: effectiveTeeTime,
  };
}
