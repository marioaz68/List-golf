/**
 * Alertas de ritmo dirigidas exclusivamente al chat del comité (NUNCA al
 * caddie/jugador). El principio: el sistema de ritmo es informativo para el
 * comité y los marshalls; nunca debe interrumpir a quien está jugando.
 *
 * Detecta grupos con atraso > UMBRAL respecto al ritmo esperado y manda un
 * mensaje al grupo de Telegram configurado en TELEGRAM_COMMITTEE_CHAT_ID.
 *
 * Idempotente: usa telegram_outbox con kind="ritmo_committee_late_<groupId>"
 * para mandar máximo 1 alerta por grupo por hora. Si el atraso se mantiene
 * o empeora, espera la próxima ventana antes de re-alertar.
 *
 * Se ejecuta dentro del cron `runRitmoReminders` para reusar la
 * autenticación y el muestreo de cada 5 min.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";
import {
  computePace,
  loadPerHoleMinutes,
  smoothedHoleForGroup,
} from "./paceCalculator";

const LATE_THRESHOLD_MIN = 15;       // a partir de 15 min se considera atraso "alertable"
const ALERT_COOLDOWN_MIN = 60;       // máximo 1 alerta por grupo por hora
const ACTIVE_ROUND_GAP_DAYS = 0;     // solo rondas de hoy

interface RoundLite {
  id: string;
  tournament_id: string;
  round_date: string | null;
  round_no: number | null;
}

interface GroupLite {
  id: string;
  round_id: string;
  group_no: number | null;
  starting_hole: number | null;
  tee_time: string | null;
  actual_start_at: string | null;
}

export interface PaceAlertRunResult {
  ok: true;
  alertsChecked: number;
  alertsSent: number;
  skippedNoChatId: boolean;
  errors: string[];
}

export async function runPaceAlertsForCommittee(
  supabase: SupabaseClient
): Promise<PaceAlertRunResult> {
  const committeeChatId = process.env.TELEGRAM_COMMITTEE_CHAT_ID?.trim();
  const errors: string[] = [];
  if (!committeeChatId) {
    return {
      ok: true,
      alertsChecked: 0,
      alertsSent: 0,
      skippedNoChatId: true,
      errors,
    };
  }

  // Hoy en horario México
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 1) Rondas de hoy
  const { data: roundsRaw, error: roundsErr } = await supabase
    .from("rounds")
    .select("id, tournament_id, round_date, round_no")
    .eq("round_date", today);
  if (roundsErr) {
    errors.push(`rounds: ${roundsErr.message}`);
    return { ok: true, alertsChecked: 0, alertsSent: 0, skippedNoChatId: false, errors };
  }
  const rounds = (roundsRaw ?? []) as RoundLite[];
  if (rounds.length === 0) {
    void ACTIVE_ROUND_GAP_DAYS;
    return { ok: true, alertsChecked: 0, alertsSent: 0, skippedNoChatId: false, errors };
  }

  const roundIds = rounds.map((r) => r.id);
  const tournamentByRound = new Map<string, string>();
  for (const r of rounds) tournamentByRound.set(r.id, r.tournament_id);
  const roundNoByRound = new Map<string, number | null>();
  for (const r of rounds) roundNoByRound.set(r.id, r.round_no);

  // 2) Grupos de esas rondas
  const { data: groupsRaw, error: groupsErr } = await supabase
    .from("pairing_groups")
    .select("id, round_id, group_no, starting_hole, tee_time, actual_start_at")
    .in("round_id", roundIds)
    .order("group_no", { ascending: true });
  if (groupsErr) {
    errors.push(`groups: ${groupsErr.message}`);
    return { ok: true, alertsChecked: 0, alertsSent: 0, skippedNoChatId: false, errors };
  }
  const groups = (groupsRaw ?? []) as GroupLite[];

  let alertsSent = 0;
  let alertsChecked = 0;

  for (const group of groups) {
    const tournamentId = tournamentByRound.get(group.round_id);
    if (!tournamentId) continue;

    // Solo evaluamos grupos que ya tienen tee_time y han salido (o se
    // estima que ya salieron). Si actual_start_at existe, también lo usamos.
    if (!group.tee_time) continue;

    alertsChecked++;

    // Hoyo "estable" del grupo (moda de últimos pings, ya filtrados por C+D)
    const hoyoActual = await smoothedHoleForGroup(supabase, group.id);
    if (hoyoActual == null) continue; // si no sabemos en qué hoyo está, no podemos calcular atraso

    const perHoleMinutes = await loadPerHoleMinutes(supabase, null);
    const pace = computePace({
      hoyoActual,
      teeTimeISO: group.tee_time,
      actualStartISO: group.actual_start_at,
      teeStartHole: group.starting_hole ?? 1,
      roundDate: today,
      perHoleMinutes,
    });

    if (pace.kind !== "atrasado") continue;
    if (pace.deltaMinutes < LATE_THRESHOLD_MIN) continue;

    // Cooldown: ¿ya mandamos alerta de ESTE grupo en la última hora?
    // El outbox guarda group_id como columna aparte, así que filtramos por
    // kind + group_id y no necesitamos meter el group_id en el string.
    const cooldownCutoff = new Date(
      Date.now() - ALERT_COOLDOWN_MIN * 60 * 1000
    ).toISOString();
    const kind = "ritmo_committee_late" as const;
    const { data: lastAlert } = await supabase
      .from("telegram_outbox")
      .select("id, sent_at")
      .eq("kind", kind)
      .eq("group_id", group.id)
      .gte("sent_at", cooldownCutoff)
      .order("sent_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastAlert) continue; // ya alertamos hace menos de 1 h

    const roundNo = roundNoByRound.get(group.round_id);
    const teeHHMM = (group.tee_time ?? "").slice(0, 5);
    const text = [
      `⚠️ Atraso en Grupo ${group.group_no ?? "?"}`,
      `Ronda ${roundNo ?? "?"} · Tee ${teeHHMM || "-"}`,
      `Hoyo ${hoyoActual} · atrasado ~${Math.round(pace.deltaMinutes)} min vs ritmo esperado`,
      "",
      "Revisar en el dashboard si conviene mover marshall.",
    ].join("\n");

    // Mandamos directo y registramos manualmente para NO borrar alertas
    // pre-existentes de otros grupos (sendAndTrackTelegramMessage borraría
    // todos los mensajes del mismo kind+chat sin importar group_id).
    const sent = await sendTelegramMessage({
      chatId: committeeChatId,
      text,
    });
    if (sent.ok) {
      alertsSent++;
      if (sent.messageId != null) {
        try {
          await supabase.from("telegram_outbox").insert({
            tournament_id: tournamentId,
            chat_id: committeeChatId,
            message_id: sent.messageId,
            round_id: group.round_id,
            group_id: group.id,
            kind,
          });
        } catch (e: any) {
          errors.push(`outbox insert: ${e?.message ?? String(e)}`);
        }
      }
    }
  }

  return {
    ok: true,
    alertsChecked,
    alertsSent,
    skippedNoChatId: false,
    errors,
  };
}
