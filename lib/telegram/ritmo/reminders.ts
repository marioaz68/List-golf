/**
 * Recordatorios automáticos del módulo de ritmo.
 *
 * Para cada grupo activo en el día de hoy:
 *  - 15-25 min ANTES del tee_time: invitar a compartir Live Location.
 *  - 10-30 min DESPUÉS del tee_time SIN posición compartida: recordatorio "no veo tu ubicación".
 *
 * Se usa telegram_outbox con kinds "ritmo_share_invite" y "ritmo_share_late"
 * para no duplicar mensajes — el outbox borra el anterior antes de mandar uno nuevo.
 *
 * Idempotente: corre cada 5 min vía cron. Si no hay nada que hacer, no hace nada.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAndTrackTelegramMessage } from "@/lib/telegram/outbox";

const PRE_TEE_WINDOW_MIN = 25;    // mandar invite cuando faltan ≤25 min
const PRE_TEE_MIN_MIN = 15;       // pero solo si faltan ≥15 min
const POST_TEE_LATE_MIN = 10;     // recordatorio "tarde" si pasaron ≥10 min
const POST_TEE_LATE_MAX_MIN = 30; // y NO más de 30 min (después ya no insiste)
const NO_POSITION_WINDOW_MIN = 15; // si no hubo posición en los últimos 15 min

interface ReminderRunResult {
  ok: true;
  invitedCount: number;
  lateCount: number;
  groupsChecked: number;
  errors: string[];
}

export async function runRitmoReminders(
  supabase: SupabaseClient
): Promise<ReminderRunResult> {
  const errors: string[] = [];
  const now = new Date();
  // Fecha "de hoy" en horario de México (UTC-6, Querétaro sin horario de verano),
  // para que coincida con round_date aunque el servidor corra en UTC.
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // 1) Rondas activas del día (tournament debe estar activo)
  const { data: rounds, error: roundsErr } = await supabase
    .from("rounds")
    .select("id, round_no, round_date, tournament_id, tournaments ( id, status )")
    .eq("round_date", today);
  if (roundsErr) {
    return { ok: true, invitedCount: 0, lateCount: 0, groupsChecked: 0,
      errors: [`rounds lookup: ${roundsErr.message}`] };
  }
  const activeRoundIds = (rounds ?? [])
    .filter((r: any) => {
      const t = Array.isArray(r.tournaments) ? r.tournaments[0] : r.tournaments;
      return !t?.status || t.status !== "archived";
    })
    .map((r) => r.id);

  if (activeRoundIds.length === 0) {
    return { ok: true, invitedCount: 0, lateCount: 0, groupsChecked: 0, errors };
  }

  // 2) Grupos de esas rondas
  const { data: groups, error: groupsErr } = await supabase
    .from("pairing_groups")
    .select("id, round_id, tee_time, starting_hole")
    .in("round_id", activeRoundIds);
  if (groupsErr) {
    return { ok: true, invitedCount: 0, lateCount: 0, groupsChecked: 0,
      errors: [`groups lookup: ${groupsErr.message}`] };
  }
  if (!groups || groups.length === 0) {
    return { ok: true, invitedCount: 0, lateCount: 0, groupsChecked: 0, errors };
  }

  let invitedCount = 0;
  let lateCount = 0;
  const tournamentIdByRound = new Map<string, string>();
  for (const r of rounds ?? []) tournamentIdByRound.set(r.id, r.tournament_id);

  for (const group of groups) {
    const tournamentId = tournamentIdByRound.get(group.round_id) ?? "";
    if (!tournamentId) continue;

    const teeDate = parseTeeDateTime(today, group.tee_time);
    if (!teeDate) continue;

    const diffMin = (teeDate.getTime() - now.getTime()) / 60000;

    // CASO A: faltan 15-25 min para la salida → invite
    if (diffMin >= PRE_TEE_MIN_MIN && diffMin <= PRE_TEE_WINDOW_MIN) {
      const sent = await sendInviteToGroup(supabase, {
        tournamentId,
        groupId: group.id,
        roundId: group.round_id,
        teeTime: group.tee_time,
        startingHole: group.starting_hole ?? 1,
        minutesLeft: Math.round(diffMin),
      });
      invitedCount += sent;
      continue;
    }

    // CASO B: pasaron 10-30 min de la salida y nadie compartió posición → late
    const minutesSinceTee = -diffMin;
    if (minutesSinceTee >= POST_TEE_LATE_MIN && minutesSinceTee <= POST_TEE_LATE_MAX_MIN) {
      const hasPositions = await groupHasRecentPositions(supabase, group.id);
      if (!hasPositions) {
        const sent = await sendLateToGroup(supabase, {
          tournamentId,
          groupId: group.id,
          roundId: group.round_id,
          minutesLate: Math.round(minutesSinceTee),
        });
        lateCount += sent;
      }
    }
  }

  return {
    ok: true,
    invitedCount,
    lateCount,
    groupsChecked: groups.length,
    errors,
  };
}

async function groupHasRecentPositions(
  supabase: SupabaseClient,
  groupId: string
): Promise<boolean> {
  const cutoff = new Date(Date.now() - NO_POSITION_WINDOW_MIN * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("ritmo_positions")
    .select("id", { count: "exact", head: true })
    .eq("group_id", groupId)
    .gte("ts", cutoff);
  return (count ?? 0) > 0;
}

async function sendInviteToGroup(
  supabase: SupabaseClient,
  args: { tournamentId: string; groupId: string; roundId: string;
          teeTime: string | null; startingHole: number; minutesLeft: number; }
): Promise<number> {
  let sent = 0;

  const players = await loadGroupPlayers(supabase, args.groupId);
  for (const p of players) {
    if (!p.chatId) continue;
    const text = [
      `🏌️ Tu salida es en ~${args.minutesLeft} min.`,
      `Tee time: ${args.teeTime ?? "-"} · Hoyo de salida: ${args.startingHole}`,
      "",
      "Para que el comité pueda monitorear el ritmo de tu grupo:",
      "📎 Adjuntar → Ubicación → *Compartir mi ubicación en tiempo real* → 8 horas",
      "",
      "Solo tienes que hacerlo una vez al inicio. Después puedes guardar el celular.",
    ].join("\n");
    const result = await sendAndTrackTelegramMessage(supabase, {
      tournamentId: args.tournamentId,
      chatId: p.chatId,
      text,
      kind: "ritmo_share_invite",
      roundId: args.roundId,
      groupId: args.groupId,
    });
    if (result.ok) sent++;
  }

  // También a los caddies del grupo (suelen ser ellos quienes llevan el GPS).
  const caddies = await loadGroupCaddies(
    supabase,
    args.groupId,
    args.roundId,
    args.tournamentId
  );
  for (const c of caddies) {
    const text = [
      `🏌️ El grupo que acompañas sale en ~${args.minutesLeft} min.`,
      `Tee time: ${args.teeTime ?? "-"} · Hoyo de salida: ${args.startingHole}`,
      "",
      "Para que el comité vea el ritmo de tu grupo:",
      "📎 Adjuntar → Ubicación → *Compartir mi ubicación en tiempo real* → 8 horas",
      "",
      "Solo una vez al inicio. Después puedes guardar el celular.",
    ].join("\n");
    const result = await sendAndTrackTelegramMessage(supabase, {
      tournamentId: args.tournamentId,
      chatId: c.chatId,
      text,
      kind: "ritmo_share_invite",
      roundId: args.roundId,
      groupId: args.groupId,
    });
    if (result.ok) sent++;
  }

  return sent;
}

async function sendLateToGroup(
  supabase: SupabaseClient,
  args: { tournamentId: string; groupId: string; roundId: string;
          minutesLate: number; }
): Promise<number> {
  let sent = 0;

  const players = await loadGroupPlayers(supabase, args.groupId);
  for (const p of players) {
    if (!p.chatId) continue;
    const text = [
      `⏰ Ya pasaron ~${args.minutesLate} min de tu salida y aún no recibo tu ubicación.`,
      "",
      "Si ya estás en el campo, comparte tu Live Location:",
      "📎 Adjuntar → Ubicación → *Compartir mi ubicación en tiempo real* → 8 horas",
      "",
      "Sin esto, el sistema no puede monitorear el ritmo de tu grupo.",
    ].join("\n");
    const result = await sendAndTrackTelegramMessage(supabase, {
      tournamentId: args.tournamentId,
      chatId: p.chatId,
      text,
      kind: "ritmo_share_late",
      roundId: args.roundId,
      groupId: args.groupId,
    });
    if (result.ok) sent++;
  }

  const caddies = await loadGroupCaddies(
    supabase,
    args.groupId,
    args.roundId,
    args.tournamentId
  );
  for (const c of caddies) {
    const text = [
      `⏰ Ya pasaron ~${args.minutesLate} min de la salida de tu grupo y aún no recibo ubicación.`,
      "",
      "Si ya estás en el campo, comparte tu Live Location:",
      "📎 Adjuntar → Ubicación → *Compartir mi ubicación en tiempo real* → 8 horas",
      "",
      "Sin esto, el sistema no puede ver el ritmo de tu grupo.",
    ].join("\n");
    const result = await sendAndTrackTelegramMessage(supabase, {
      tournamentId: args.tournamentId,
      chatId: c.chatId,
      text,
      kind: "ritmo_share_late",
      roundId: args.roundId,
      groupId: args.groupId,
    });
    if (result.ok) sent++;
  }

  return sent;
}

interface GroupPlayer {
  playerId: string;
  chatId: string | null;
  firstName: string | null;
}

async function loadGroupPlayers(
  supabase: SupabaseClient,
  groupId: string
): Promise<GroupPlayer[]> {
  const { data, error } = await supabase
    .from("pairing_group_members")
    .select(
      "entry_id, tournament_entries ( player_id, players ( id, first_name, telegram_chat_id ) )"
    )
    .eq("group_id", groupId);
  if (error || !data) return [];
  const out: GroupPlayer[] = [];
  for (const row of data as any[]) {
    const entry = Array.isArray(row.tournament_entries)
      ? row.tournament_entries[0]
      : row.tournament_entries;
    const player = Array.isArray(entry?.players) ? entry.players[0] : entry?.players;
    if (!player?.id) continue;
    out.push({
      playerId: player.id,
      chatId: player.telegram_chat_id ?? null,
      firstName: player.first_name ?? null,
    });
  }
  return out;
}

interface GroupCaddie {
  caddieId: string;
  chatId: string;
  firstName: string | null;
}

/** Caddies asignados al grupo en la ronda con ID de Telegram numérico válido. */
async function loadGroupCaddies(
  supabase: SupabaseClient,
  groupId: string,
  roundId: string,
  tournamentId: string
): Promise<GroupCaddie[]> {
  const { data: members } = await supabase
    .from("pairing_group_members")
    .select("entry_id")
    .eq("group_id", groupId);
  const entryIds = Array.from(
    new Set((members ?? []).map((m: any) => m.entry_id).filter(Boolean))
  );
  if (entryIds.length === 0) return [];

  const { data, error } = await supabase
    .from("caddie_assignments")
    .select("caddie_id, caddies ( first_name, telegram )")
    .eq("tournament_id", tournamentId)
    .eq("round_id", roundId)
    .eq("is_active", true)
    .in("entry_id", entryIds);
  if (error || !data) return [];

  const byCaddie = new Map<string, GroupCaddie>();
  for (const row of data as any[]) {
    const caddieId = String(row.caddie_id ?? "");
    if (!caddieId || byCaddie.has(caddieId)) continue;
    const c = Array.isArray(row.caddies) ? row.caddies[0] : row.caddies;
    const tg = String(c?.telegram ?? "").trim();
    if (!/^\d+$/.test(tg)) continue; // sin ID de Telegram válido → no se le puede escribir
    byCaddie.set(caddieId, {
      caddieId,
      chatId: tg,
      firstName: c?.first_name ?? null,
    });
  }
  return Array.from(byCaddie.values());
}

function parseTeeDateTime(roundDate: string, teeTime: string | null): Date | null {
  if (!teeTime) return null;
  const time = teeTime.includes("T") ? teeTime.split("T")[1]?.slice(0, 8) : teeTime;
  if (!time) return null;
  // El tee_time se guarda en hora de México (UTC-6, sin horario de verano).
  // Fijamos el offset para obtener el instante UTC correcto en el servidor.
  const hhmmss = time.length === 5 ? `${time}:00` : time;
  const iso = `${roundDate}T${hhmmss}-06:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
