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

/** Contexto resuelto del remitente (jugador o caddie) para el ritmo. */
export type ResolvedContext = {
  tournamentId: string;
  courseName: string | null;
  courseId: string | null;
  roundId: string | null;
  roundDate: string | null;
  groupId: string | null;
  groupTeeTime: string | null;
  groupStartHole: number;
  playerId: string | null;
  displayName: string;
  /** "player" | "caddie" — solo para mensajes. */
  kind: "player" | "caddie";
};

function oneOrNull<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

type RoundLite = { id: string; round_no: number | null; round_date: string | null };
type GroupLite = { id: string; starting_hole: number | null; tee_time: string | null };

/** Fecha de hoy en horario de México (YYYY-MM-DD). */
function todayMexicoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Ronda "activa": la de hoy; si no hay, la última jugada (fecha ≤ hoy); si no,
 *  la primera. Importante en torneos de varias rondas (p. ej. match play). */
async function resolveActiveRound(
  supabase: SupabaseClient,
  tournamentId: string
): Promise<RoundLite | null> {
  const { data } = await supabase
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });
  const rounds = (data ?? []) as RoundLite[];
  if (rounds.length === 0) return null;

  const today = todayMexicoDate();
  const todayRound = rounds.find((r) => r.round_date === today);
  if (todayRound) return todayRound;

  const past = rounds
    .filter((r) => (r.round_date ?? "") !== "" && (r.round_date ?? "") <= today)
    .sort((a, b) => (b.round_date ?? "").localeCompare(a.round_date ?? ""));
  if (past[0]) return past[0];

  return rounds[0];
}

async function loadGroup(
  supabase: SupabaseClient,
  groupId: string,
  roundId: string
): Promise<GroupLite | null> {
  const { data } = await supabase
    .from("pairing_groups")
    .select("id, starting_hole, tee_time")
    .eq("id", groupId)
    .eq("round_id", roundId)
    .maybeSingle();
  return (data as GroupLite | null) ?? null;
}

/** Jugador: inscripción más reciente → torneo, ronda activa y grupo. */
export async function buildPlayerContext(
  supabase: SupabaseClient,
  player: { id: string; first_name: string | null }
): Promise<ResolvedContext | null> {
  const { data: entry } = await supabase
    .from("tournament_entries")
    .select("id, tournament_id, tournaments ( course_name, course_id )")
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!entry?.tournament_id) return null;
  const t = oneOrNull(
    entry.tournaments as
      | { course_name: string | null; course_id: string | null }
      | { course_name: string | null; course_id: string | null }[]
      | null
  );
  const round = await resolveActiveRound(supabase, entry.tournament_id);

  let group: GroupLite | null = null;
  if (round?.id) {
    const { data: gm } = await supabase
      .from("pairing_group_members")
      .select("group_id")
      .eq("entry_id", entry.id)
      .maybeSingle();
    if (gm?.group_id) group = await loadGroup(supabase, gm.group_id, round.id);
  }

  return {
    tournamentId: entry.tournament_id,
    courseName: t?.course_name ?? null,
    courseId: t?.course_id ?? null,
    roundId: round?.id ?? null,
    roundDate: round?.round_date ?? null,
    groupId: group?.id ?? null,
    groupTeeTime: group?.tee_time ?? null,
    groupStartHole: group?.starting_hole ?? 1,
    playerId: player.id,
    displayName: player.first_name ?? "jugador",
    kind: "player",
  };
}

/** Caddie: asignación activa más reciente → torneo, ronda activa y grupo. */
export async function buildCaddieContext(
  supabase: SupabaseClient,
  caddie: { id: string; first_name: string | null }
): Promise<ResolvedContext | null> {
  const { data: asgs } = await supabase
    .from("caddie_assignments")
    .select("tournament_id, entry_id, round_id, pairing_group_id, created_at")
    .eq("caddie_id", caddie.id)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (!asgs || asgs.length === 0) return null;

  type Asg = {
    tournament_id: string;
    entry_id: string | null;
    round_id: string | null;
    pairing_group_id: string | null;
  };
  const list = asgs as Asg[];
  const tournamentId = list[0].tournament_id;

  const { data: t } = await supabase
    .from("tournaments")
    .select("course_name, course_id")
    .eq("id", tournamentId)
    .maybeSingle();

  const round = await resolveActiveRound(supabase, tournamentId);

  let group: GroupLite | null = null;
  if (round?.id) {
    // Asignación del caddie para ESA ronda (a qué jugador/inscrito cadea hoy).
    const forRound =
      list.find((a) => a.tournament_id === tournamentId && a.round_id === round.id) ??
      list.find((a) => a.tournament_id === tournamentId) ??
      null;

    // 1) Grupo ACTUAL del inscrito en esta ronda (vía pairing_group_members).
    //    Es la fuente más confiable: si regeneras grupos, el caddie se realinea
    //    solo al grupo donde quedó su jugador ese día.
    if (forRound?.entry_id) {
      const { data: gm } = await supabase
        .from("pairing_group_members")
        .select("group_id, pairing_groups!inner ( id, round_id )")
        .eq("entry_id", forRound.entry_id);
      for (const row of (gm ?? []) as {
        group_id: string;
        pairing_groups:
          | { id: string; round_id: string }
          | { id: string; round_id: string }[]
          | null;
      }[]) {
        const pg = oneOrNull(row.pairing_groups);
        if (pg?.round_id === round.id) {
          group = await loadGroup(supabase, row.group_id, round.id);
          break;
        }
      }
    }

    // 2) Respaldo: el pairing_group_id guardado en la asignación (puede quedar
    //    viejo si se regeneraron grupos; loadGroup valida que sea de la ronda).
    if (!group && forRound?.pairing_group_id) {
      group = await loadGroup(supabase, forRound.pairing_group_id, round.id);
    }
  }

  return {
    tournamentId,
    courseName: (t?.course_name as string | null) ?? null,
    courseId: (t?.course_id as string | null) ?? null,
    roundId: round?.id ?? null,
    roundDate: round?.round_date ?? null,
    groupId: group?.id ?? null,
    groupTeeTime: group?.tee_time ?? null,
    groupStartHole: group?.starting_hole ?? 1,
    playerId: null,
    displayName: caddie.first_name ?? "caddie",
    kind: "caddie",
  };
}

/** Resultado de resolver el remitente de Telegram a su contexto de ritmo. */
export type RitmoResolution =
  | { status: "ok"; ctx: ResolvedContext }
  | { status: "not_linked" }
  | { status: "no_active" };

/** Resuelve un telegram_user_id a su contexto de ritmo: primero como jugador
 *  (players.telegram_user_id), luego como caddie (caddies.telegram, donde el
 *  comité captura el ID numérico). Reutilizado por la captura de ubicación y
 *  por el comando RITMO. */
export async function resolveRitmoContext(
  supabase: SupabaseClient,
  telegramUserId: string
): Promise<RitmoResolution> {
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id, first_name, last_name")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (playerErr) {
    console.error("RITMO PLAYER LOOKUP:", playerErr);
  }

  if (player) {
    const ctx = await buildPlayerContext(supabase, player);
    return ctx ? { status: "ok", ctx } : { status: "no_active" };
  }

  const { data: caddie } = await supabase
    .from("caddies")
    .select("id, first_name, last_name")
    .eq("telegram", telegramUserId)
    .maybeSingle();

  if (caddie) {
    const ctx = await buildCaddieContext(supabase, caddie);
    return ctx ? { status: "ok", ctx } : { status: "no_active" };
  }

  return { status: "not_linked" };
}

/** Pipeline completo: identifica al remitente (jugador o caddie del grupo),
 *  su grupo activo, detecta el hoyo y guarda la posición. Devuelve un reply
 *  solo cuando vale la pena (1er share, no un update silencioso de Live). */
export async function handleRitmoLocationUpdate(
  supabase: SupabaseClient,
  input: RitmoLocationInput
): Promise<RitmoLocationResult> {
  const { telegramUserId, lat, lon, isLiveUpdate } = input;

  // 1) Resolver remitente: primero jugador, luego caddie.
  const resolution = await resolveRitmoContext(supabase, telegramUserId);

  if (resolution.status === "not_linked") {
    return isLiveUpdate
      ? { ok: true, silent: true }
      : {
          ok: true,
          reply:
            "No estás vinculado en List.golf como jugador ni caddie. Pide al comité que te dé de alta.",
        };
  }
  if (resolution.status === "no_active") {
    return isLiveUpdate
      ? { ok: true, silent: true }
      : {
          ok: true,
          reply: "No tienes torneo/ronda activa asignada en este momento.",
        };
  }

  const ctx = resolution.ctx;

  const holes = getCourseHoles(ctx.courseName);
  if (!holes) {
    return {
      ok: true,
      silent: isLiveUpdate,
      reply: isLiveUpdate
        ? undefined
        : `📍 Recibido, pero no tengo polígonos cargados para "${ctx.courseName ?? "este curso"}".`,
    };
  }

  // 2) Detectar hoyo y guardar posición.
  const hoyoInstantaneo = detectHole({ lat, lon }, holes);
  const { error: insertErr } = await supabase.from("ritmo_positions").insert({
    tournament_id: ctx.tournamentId,
    round_id: ctx.roundId,
    group_id: ctx.groupId,
    player_id: ctx.playerId,
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

  // 3) Live updates silenciosos. Primer share: confirma con estado del grupo.
  if (isLiveUpdate) return { ok: true, silent: true };

  const hoyoSuavizado = ctx.groupId
    ? (await smoothedHoleForGroup(supabase, ctx.groupId)) ?? hoyoInstantaneo
    : hoyoInstantaneo;

  const perHoleMinutes = await loadPerHoleMinutes(supabase, ctx.courseId);
  const pace = computePace({
    hoyoActual: hoyoSuavizado,
    teeTimeISO: ctx.groupTeeTime,
    teeStartHole: ctx.groupStartHole,
    roundDate: ctx.roundDate,
    perHoleMinutes,
  });

  const noGroupHint =
    !ctx.groupId
      ? "\n\n(Aún no tienes grupo asignado en esta ronda; tu posición se guarda igual.)"
      : "";

  return {
    ok: true,
    reply: [
      `📍 Recibida tu ubicación, ${ctx.displayName}${ctx.kind === "caddie" ? " (caddie)" : ""}.`,
      "",
      pace.msg,
      "",
      "Tu Live Location seguirá actualizándose en segundo plano mientras esté activa.",
      "Si quieres ver el estado en cualquier momento, escribe: RITMO" + noGroupHint,
    ].join("\n"),
  };
}
