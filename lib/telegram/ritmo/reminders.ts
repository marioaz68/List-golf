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
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD UTC
  const now = new Date();

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
  const players = await loadGroupPlayers(supabase, args.groupId);
  let sent = 0;
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
  return sent;
}

async function sendLateToGroup(
  supabase: SupabaseClient,
  args: { tournamentId: string; groupId: string; roundId: string;
          minutesLate: number; }
): Promise<number> {
  const players = await loadGroupPlayers(supabase, args.groupId);
  let sent = 0;
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

function parseTeeDateTime(roundDate: string, teeTime: string | null): Date | null {
  if (!teeTime) return null;
  const time = teeTime.includes("T") ? teeTime.split("T")[1]?.slice(0, 8) : teeTime;
  if (!time) return null;
  const iso = `${roundDate}T${time.length === 5 ? `${time}:00` : time}`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}
