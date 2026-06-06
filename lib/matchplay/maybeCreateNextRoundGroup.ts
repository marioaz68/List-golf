import type { SupabaseClient } from "@supabase/supabase-js";
import { countConsolationMatchesInRound } from "@/lib/matchplay/consolationMatchPlay";

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
  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes")
    .eq("tournament_id", params.tournamentId)
    .eq("round_no", nextRoundNo)
    .maybeSingle();
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
  const consolCount = await countConsolationMatchesInRound(
    admin,
    params.tournamentId,
    nextRoundNo
  );
  const groupNo = consolCount + positionNo;
  const teeTime =
    baseMinutes != null
      ? formatHHMM(baseMinutes + (groupNo - 1) * interval)
      : null;

  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, player_a_entry_id, player_b_entry_id, seed")
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

  const entryIds: string[] = [
    topPair.player_a_entry_id,
    topPair.player_b_entry_id,
    botPair.player_a_entry_id,
    botPair.player_b_entry_id,
  ].filter((v): v is string => !!v);

  const topLabel = topPair.seed != null ? `#${topPair.seed}` : "TOP";
  const botLabel = botPair.seed != null ? `#${botPair.seed}` : "BOT";
  const notes = `MATCH PLAY · ${topLabel} vs ${botLabel}`;

  const { data: existing } = await admin
    .from("pairing_groups")
    .select("id")
    .eq("round_id", nextRoundId)
    .eq("group_no", groupNo)
    .maybeSingle();

  let groupRecordId: string;
  let created = false;
  let updated = false;
  if (existing?.id) {
    groupRecordId = String(existing.id);
    await admin
      .from("pairing_groups")
      .update({
        tee_time: teeTime ?? null,
        notes,
      })
      .eq("id", groupRecordId);
    await admin
      .from("pairing_group_members")
      .delete()
      .eq("group_id", groupRecordId);
    updated = true;
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
      return {
        ok: false,
        created: false,
        groupNo,
        roundId: nextRoundId,
        teeTime,
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

  return {
    ok: true,
    created,
    updated,
    groupNo,
    roundId: nextRoundId,
    teeTime,
  };
}
