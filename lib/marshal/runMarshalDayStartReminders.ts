import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyMarshalsRoundDayStart } from "@/lib/marshal/notifyMarshalsRoundDayStart";
import { todayMexicoDate } from "@/lib/ritmo/opsDay";

/** Hora local México (0–23). */
function mexicoHour(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Mexico_City",
    hour: "numeric",
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find((p) => p.type === "hour")?.value;
  return Number(h ?? 0);
}

/**
 * A las 5:00–5:29 (México), manda a marshals el aviso de inicio de ronda
 * para cada torneo con round_date = hoy. Idempotente vía telegram_outbox
 * (kind marshal_day_start).
 */
export async function runMarshalDayStartReminders(
  admin: SupabaseClient
): Promise<{
  ok: true;
  hour: number;
  skippedWindow: boolean;
  rounds: number;
  sent: number;
  failed: number;
}> {
  const hour = mexicoHour();
  if (hour < 5 || hour >= 6) {
    return {
      ok: true,
      hour,
      skippedWindow: true,
      rounds: 0,
      sent: 0,
      failed: 0,
    };
  }

  const today = todayMexicoDate();
  const { data: roundRows } = await admin
    .from("rounds")
    .select(
      "id, round_no, round_date, tournament_id, tournaments ( id, name, is_archived )"
    )
    .eq("round_date", today);

  let sent = 0;
  let failed = 0;
  let rounds = 0;

  const seen = new Set<string>();
  for (const row of roundRows ?? []) {
    const tournament = Array.isArray((row as { tournaments?: unknown }).tournaments)
      ? (row as { tournaments: { id?: string; name?: string; is_archived?: boolean }[] })
          .tournaments[0]
      : (row as {
          tournaments?: {
            id?: string;
            name?: string;
            is_archived?: boolean;
          } | null;
        }).tournaments;
    if (tournament?.is_archived) continue;

    const tournamentId = String(
      (row as { tournament_id?: string }).tournament_id ?? tournament?.id ?? ""
    ).trim();
    const roundId = String((row as { id?: string }).id ?? "").trim();
    const key = `${tournamentId}:${roundId}`;
    if (!tournamentId || !roundId || seen.has(key)) continue;
    seen.add(key);
    rounds += 1;

    const res = await notifyMarshalsRoundDayStart(admin, {
      tournamentId,
      roundId,
      roundNo: (row as { round_no?: number | null }).round_no ?? null,
      roundDate: (row as { round_date?: string | null }).round_date ?? null,
      tournamentName: tournament?.name ?? null,
    });
    sent += res.sent;
    failed += res.failed;
  }

  return { ok: true, hour, skippedWindow: false, rounds, sent, failed };
}
