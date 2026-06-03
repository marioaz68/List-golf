import type { SupabaseClient } from "@supabase/supabase-js";
import { detectHole } from "./geometry";
import { getCourseHoles } from "./holes";
import {
  computePace,
  loadPerHoleMinutes,
  smoothedHoleForGroup,
} from "./paceCalculator";

export interface RitmoLocationInput {
  telegramUserId: string;
  lat: number;
  lon: number;
  messageId?: number | null;
  isLiveUpdate: boolean;   // true si vino en edited_message
}

export interface RitmoLocationResult {
  ok: boolean;
  reply?: string;          // mensaje a mandar al chat (solo en el 1er share)
  silent?: boolean;        // true = no mandar nada (es un update silencioso de Live)
  error?: string;
}

/** Pipeline completo: identifica al jugador, su grupo activo, detecta el hoyo
 *  y guarda la posición. Devuelve un reply solo cuando vale la pena (1er share
 *  no es un update silencioso de Live). */
export async function handleRitmoLocationUpdate(
  supabase: SupabaseClient,
  input: RitmoLocationInput
): Promise<RitmoLocationResult> {
  const { telegramUserId, lat, lon, isLiveUpdate } = input;

  // 1) Resolver player desde telegram_user_id
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (playerErr) {
    console.error("RITMO PLAYER LOOKUP:", playerErr);
    return { ok: false, error: "Error buscando jugador" };
  }
  if (!player) {
    return isLiveUpdate
      ? { ok: true, silent: true }
      : { ok: true, reply: "No estás vinculado como jugador en List.golf. Pide al comité que te dé de alta." };
  }

  // 2) Inscripción activa más reciente
  const { data: entry } = await supabase
    .from("tournament_entries")
    .select("id, tournament_id, tournaments ( id, name, course_name, course_id )")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry?.tournament_id) {
    return isLiveUpdate
      ? { ok: true, silent: true }
      : { ok: true, reply: "No tienes inscripción activa en un torneo." };
  }

  const tournamentRow = Array.isArray(entry.tournaments) ? entry.tournaments[0] : entry.tournaments;
  const courseName = tournamentRow?.course_name ?? null;
  const courseId = (tournamentRow as { course_id?: string | null } | null)?.course_id ?? null;
  const holes = getCourseHoles(courseName);
  if (!holes) {
    return {
      ok: true,
      silent: isLiveUpdate,
      reply: isLiveUpdate
        ? undefined
        : `📍 Recibido, pero no tengo polígonos cargados para "${courseName ?? "este curso"}".`,
    };
  }

  // 3) Ronda activa
  const { data: round } = await supabase
    .from("rounds")
    .select("id, round_no, round_date, start_type, start_time")
    .eq("tournament_id", entry.tournament_id)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 4) Grupo via pairing_group_members
  let groupId: string | null = null;
  let groupTeeTime: string | null = null;
  let groupStartHole = 1;
  if (round?.id) {
    const { data: gm } = await supabase
      .from("pairing_group_members")
      .select("group_id")
      .eq("entry_id", entry.id)
      .maybeSingle();
    if (gm?.group_id) {
      const { data: g } = await supabase
        .from("pairing_groups")
        .select("id, starting_hole, tee_time")
        .eq("id", gm.group_id)
        .eq("round_id", round.id)
        .maybeSingle();
      if (g) {
        groupId = g.id;
        groupTeeTime = g.tee_time;
        groupStartHole = g.starting_hole ?? 1;
      }
    }
  }

  // 5) Detectar hoyo y guardar
  const hoyoInstantaneo = detectHole({ lat, lon }, holes);
  const { error: insertErr } = await supabase.from("ritmo_positions").insert({
    tournament_id: entry.tournament_id,
    round_id: round?.id ?? null,
    group_id: groupId,
    player_id: player.id,
    telegram_user_id: telegramUserId,
    telegram_message_id: input.messageId ?? null,
    lat,
    lon,
    hoyo_detectado: hoyoInstantaneo,
    is_live_update: isLiveUpdate,
  });
  if (insertErr) {
    console.error("RITMO INSERT POSITION:", insertErr);
    return { ok: false, error: "No pude guardar la posición" };
  }

  // 6) Live updates silenciosos. Primer share: confirma con estado del grupo.
  if (isLiveUpdate) return { ok: true, silent: true };

  const hoyoSuavizado = groupId
    ? (await smoothedHoleForGroup(supabase, groupId)) ?? hoyoInstantaneo
    : hoyoInstantaneo;

  const perHoleMinutes = await loadPerHoleMinutes(supabase, courseId);
  const pace = computePace({
    hoyoActual: hoyoSuavizado,
    teeTimeISO: groupTeeTime,
    teeStartHole: groupStartHole,
    roundDate: round?.round_date ?? null,
    perHoleMinutes,
  });

  return {
    ok: true,
    reply: [
      `📍 Recibida tu ubicación, ${player.first_name ?? "jugador"}.`,
      "",
      pace.msg,
      "",
      "Tu Live Location seguirá actualizándose en segundo plano mientras esté activa.",
      "Si quieres ver el estado en cualquier momento, escribe: RITMO",
    ].join("\n"),
  };
}
