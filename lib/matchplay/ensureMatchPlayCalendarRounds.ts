import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";

export type EnsureMatchPlayCalendarRoundsResult = {
  ok: true;
  created: number;
  updated: number;
  existing: number;
  roundCount: number;
};

type RoundPlan = {
  round_no: number;
  offsetDays: number;
  start_time: string;
  wave: "AM" | "PM";
  start_type: "tee_time" | "shotgun";
  interval_minutes: number;
  group_size: number;
  notes?: string;
};

function addCalendarDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)
  );
  return dt.toISOString().slice(0, 10);
}

/**
 * Calcuta 64 (6 rondas, jueves a domingo):
 *  R1 jue 07:00 · R2 jue 12:30 · R3 vie 08:00 ·
 *  R4 sáb 07:00 · R5 sáb 12:30 (semis + consolación MP) ·
 *  R6 dom 10:00 final consolación, 10:10 3er/4to, 10:20 final.
 */
export function calcutaPairsRoundPlan(roundCount: number): RoundPlan[] {
  return [
    { round_no: 1, offsetDays: 0, start_time: "07:00", wave: "AM", start_type: "tee_time", interval_minutes: 10, group_size: 4 },
    { round_no: 2, offsetDays: 0, start_time: "12:30", wave: "PM", start_type: "tee_time", interval_minutes: 10, group_size: 4 },
    { round_no: 3, offsetDays: 1, start_time: "08:00", wave: "AM", start_type: "tee_time", interval_minutes: 10, group_size: 4 },
    { round_no: 4, offsetDays: 2, start_time: "07:00", wave: "AM", start_type: "tee_time", interval_minutes: 10, group_size: 4 },
    { round_no: 5, offsetDays: 2, start_time: "12:30", wave: "PM", start_type: "tee_time", interval_minutes: 10, group_size: 4 },
    { round_no: 6, offsetDays: 3, start_time: "10:00", wave: "AM", start_type: "tee_time", interval_minutes: 10, group_size: 4 },
  ].filter((p) => p.round_no <= roundCount);
}

function sequentialRoundPlan(roundCount: number): RoundPlan[] {
  const rows: RoundPlan[] = [];
  for (let round_no = 1; round_no <= roundCount; round_no++) {
    rows.push({
      round_no,
      offsetDays: round_no - 1,
      start_time: "07:00",
      wave: "AM",
      start_type: "tee_time",
      interval_minutes: 10,
      group_size: 4,
    });
  }
  return rows;
}

function parseHHMM(raw: string): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(raw ?? "").trim());
  if (!match) return null;
  const h = Number(match[1]);
  const mm = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null;
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null;
  return h * 60 + mm;
}

function formatHHMM(totalMinutes: number): string {
  const m = ((totalMinutes % (24 * 60)) + 24 * 60) % (24 * 60);
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

export async function syncPairingGroupTeeTimes(
  admin: SupabaseClient,
  roundId: string,
  startTime: string,
  intervalMinutes: number,
  startType: "tee_time" | "shotgun" = "tee_time"
) {
  const { data: groups } = await admin
    .from("pairing_groups")
    .select("id, group_no")
    .eq("round_id", roundId)
    .order("group_no", { ascending: true });
  if (!groups?.length) return;

  const base = parseHHMM(startTime) ?? 7 * 60;
  for (const g of groups) {
    const n = Number(g.group_no ?? 1);
    const tee_time =
      startType === "shotgun"
        ? formatHHMM(base)
        : formatHHMM(base + Math.max(0, n - 1) * intervalMinutes);
    await admin.from("pairing_groups").update({ tee_time }).eq("id", g.id);
  }
}

/**
 * Crea o actualiza las filas de `rounds` del cuadro (R1…RN).
 * No borra salidas ya armadas; sí reajusta sus tee times al nuevo horario.
 */
export async function ensureMatchPlayCalendarRounds(
  admin: SupabaseClient,
  tournamentId: string
): Promise<EnsureMatchPlayCalendarRoundsResult> {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, start_date, end_date")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) {
    return { ok: true, created: 0, updated: 0, existing: 0, roundCount: 0 };
  }

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("bracket_round_count, bracket_main_pairs, config_json")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("config_json")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cfg =
    bracket?.config_json && typeof bracket.config_json === "object"
      ? (bracket.config_json as { round_count?: number; bracket_size?: number })
      : {};

  const fromSize =
    cfg.bracket_size && cfg.bracket_size >= 2
      ? roundCountForBracketSize(cfg.bracket_size)
      : 0;
  const fromRulesSize =
    rules?.bracket_main_pairs && rules.bracket_main_pairs >= 2
      ? roundCountForBracketSize(Number(rules.bracket_main_pairs))
      : 0;

  const roundCount = Math.max(
    Number(cfg.round_count ?? 0),
    Number(rules?.bracket_round_count ?? 0),
    fromSize,
    fromRulesSize,
    1
  );

  const { data: existing } = await admin
    .from("rounds")
    .select("id, round_no, start_time, interval_minutes, start_type, wave, notes")
    .eq("tournament_id", tournamentId);

  const byNo = new Map((existing ?? []).map((r) => [Number(r.round_no), r]));

  const { data: categories } = await admin
    .from("categories")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(1);

  const categoryId = categories?.[0]?.id ?? null;
  const startDate =
    typeof tournament.start_date === "string" && tournament.start_date
      ? tournament.start_date
      : new Date().toISOString().slice(0, 10);

  const plan =
    roundCount >= 6
      ? calcutaPairsRoundPlan(roundCount)
      : sequentialRoundPlan(roundCount);

  let created = 0;
  let updated = 0;

  for (const slot of plan) {
    const payload = {
      tournament_id: tournamentId,
      round_no: slot.round_no,
      category_id: categoryId,
      round_date: addCalendarDays(startDate, slot.offsetDays),
      wave: slot.wave,
      start_type: slot.start_type,
      start_time: slot.start_time,
      interval_minutes: slot.interval_minutes,
      group_size: slot.group_size,
      notes: slot.notes ?? null,
    };

    const current = byNo.get(slot.round_no);
    if (!current?.id) {
      const { error } = await admin.from("rounds").insert(payload);
      if (error) {
        throw new Error(`No se pudieron crear las rondas: ${error.message}`);
      }
      created += 1;
      continue;
    }

    const { error } = await admin.from("rounds").update(payload).eq("id", current.id);
    if (error) {
      throw new Error(`No se pudo actualizar R${slot.round_no}: ${error.message}`);
    }
    updated += 1;
    await syncPairingGroupTeeTimes(
      admin,
      String(current.id),
      slot.start_time,
      slot.interval_minutes,
      slot.start_type
    );
  }

  const plannedNos = new Set(plan.map((p) => p.round_no));
  for (const row of existing ?? []) {
    const no = Number(row.round_no);
    if (plannedNos.has(no)) continue;
    const notes = String(row.notes ?? "");
    if (!notes.toLowerCase().includes("consolaci")) continue;
    const { data: extraGroups } = await admin
      .from("pairing_groups")
      .select("id")
      .eq("round_id", row.id);
    const extraIds = (extraGroups ?? []).map((g) => g.id);
    if (extraIds.length > 0) {
      await admin.from("pairing_group_members").delete().in("group_id", extraIds);
      await admin.from("pairing_groups").delete().eq("round_id", row.id);
    }
    await admin.from("rounds").delete().eq("id", row.id);
  }

  return {
    ok: true,
    created,
    updated,
    existing: existing?.length ?? 0,
    roundCount,
  };
}

/** Domingo R6: final de consolación + 3er/4to + final del cuadro. */
export async function findLastMainRound(
  admin: SupabaseClient,
  tournamentId: string
): Promise<{
  id: string;
  start_time: string | null;
  interval_minutes: number | null;
  start_type: string | null;
  round_no: number;
} | null> {
  const { data } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes, notes, start_type, round_no")
    .eq("tournament_id", tournamentId)
    .eq("start_type", "tee_time")
    .order("round_no", { ascending: false });
  const hit = (data ?? []).find((r) => {
    const notes = String(r.notes ?? "").toLowerCase();
    return !notes.includes("consolaci");
  });
  if (!hit?.id) return null;
  return {
    id: String(hit.id),
    start_time: hit.start_time ? String(hit.start_time) : null,
    interval_minutes:
      typeof hit.interval_minutes === "number" ? hit.interval_minutes : null,
    start_type: hit.start_type ? String(hit.start_type) : null,
    round_no: Number(hit.round_no),
  };
}

/** Sábado tarde (última ronda PM de tee time): consolación MP + semis del cuadro. */
export async function findLatestAfternoonRound(
  admin: SupabaseClient,
  tournamentId: string
): Promise<{
  id: string;
  start_time: string | null;
  interval_minutes: number | null;
  start_type: string | null;
} | null> {
  const { data } = await admin
    .from("rounds")
    .select("id, start_time, interval_minutes, start_type, round_no")
    .eq("tournament_id", tournamentId)
    .eq("wave", "PM")
    .eq("start_type", "tee_time")
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.id) return null;
  return {
    id: String(data.id),
    start_time: data.start_time ? String(data.start_time) : null,
    interval_minutes:
      typeof data.interval_minutes === "number" ? data.interval_minutes : null,
    start_type: data.start_type ? String(data.start_type) : null,
  };
}
