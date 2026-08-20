import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";

export type EnsureMatchPlayCalendarRoundsResult = {
  ok: true;
  created: number;
  updated: number;
  existing: number;
  roundCount: number;
};

/** Intervalo estándar entre salidas en Calcuta 64. */
export const CALCUTA_TEE_INTERVAL_MINUTES = 12;

/** Horarios fijos del domingo (R6) cuando conviven varios formatos. */
export const CALCUTA_SUNDAY_SCHEDULE = {
  strokeStart: "08:00",
  strokeStartingHole: 10,
  consolationMpStart: "09:30",
  consolationMpStartingHole: 1,
  thirdPlace: "09:42",
  final: "09:54",
  mainStartingHole: 1,
} as const;

export const CALCUTA_SCHEDULE_RULES_TEXT =
  "Horarios de salida (12 minutos entre cada grupo): " +
  "Jueves — 1ª ronda 07:00, 2ª ronda 11:00. " +
  "Viernes — 3ª ronda 11:00. " +
  "Sábado — 4ª ronda 07:00, 5ª ronda 11:00. " +
  "Domingo — consolación stroke agregado 08:00 (salida hoyo 10), " +
  "consolación match play 09:30 (salida hoyo 1), " +
  "3er/4to lugar match play 09:42, final match play 09:54.";

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
 *  R1 jue 07:00 · R2 jue 11:00 · R3 vie 11:00 ·
 *  R4 sáb 07:00 · R5 sáb 11:00 (semis + consolación MP) ·
 *  R6 dom 08:00 stroke h10 · 09:30 consol MP h1 · 09:42 3er/4to · 09:54 final.
 *  Intervalo: 12 min entre grupos (R1–R5); domingo con horarios fijos por tipo.
 */
export function calcutaPairsRoundPlan(roundCount: number): RoundPlan[] {
  const iv = CALCUTA_TEE_INTERVAL_MINUTES;
  const plan: RoundPlan[] = [
    { round_no: 1, offsetDays: 0, start_time: "07:00", wave: "AM", start_type: "tee_time", interval_minutes: iv, group_size: 4 },
    { round_no: 2, offsetDays: 0, start_time: "11:00", wave: "AM", start_type: "tee_time", interval_minutes: iv, group_size: 4 },
    { round_no: 3, offsetDays: 1, start_time: "11:00", wave: "AM", start_type: "tee_time", interval_minutes: iv, group_size: 4 },
    { round_no: 4, offsetDays: 2, start_time: "07:00", wave: "AM", start_type: "tee_time", interval_minutes: iv, group_size: 4 },
    { round_no: 5, offsetDays: 2, start_time: "11:00", wave: "AM", start_type: "tee_time", interval_minutes: iv, group_size: 4 },
    {
      round_no: 6,
      offsetDays: 3,
      start_time: CALCUTA_SUNDAY_SCHEDULE.strokeStart,
      wave: "AM",
      start_type: "tee_time",
      interval_minutes: iv,
      group_size: 4,
      notes: "Domingo: stroke 08:00 h10 · consol MP 09:30 h1 · 3er/4to 09:42 · final 09:54",
    },
  ];
  return plan.filter((p) => p.round_no <= roundCount);
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
      interval_minutes: CALCUTA_TEE_INTERVAL_MINUTES,
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
  // Índice denso 0..n-1 (no group_no-1): si hay huecos en group_no
  // (p. ej. falta el match #1), la primera salida sigue siendo start_time.
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    const tee_time =
      startType === "shotgun"
        ? formatHHMM(base)
        : formatHHMM(base + i * intervalMinutes);
    await admin.from("pairing_groups").update({ tee_time }).eq("id", g.id);
  }
}

/**
 * Domingo R6: horarios fijos por tipo de salida (stroke h10, consol MP h1,
 * 3er/4to, final). Asume group_no ya ordenado: stroke → consol MP → 3er → final.
 */
export async function syncCalcutaFinalRoundTeeTimes(
  admin: SupabaseClient,
  roundId: string,
  intervalMinutes: number = CALCUTA_TEE_INTERVAL_MINUTES
) {
  const { data: groups } = await admin
    .from("pairing_groups")
    .select("id, group_no, notes")
    .eq("round_id", roundId)
    .order("group_no", { ascending: true });
  if (!groups?.length) return;

  const stroke = (groups ?? []).filter((g) =>
    String(g.notes ?? "").startsWith("STROKE AGREGADO · ")
  );
  const consol = (groups ?? []).filter((g) =>
    String(g.notes ?? "").startsWith("CONSOLACIÓN MP · ")
  );
  const third = (groups ?? []).filter((g) =>
    String(g.notes ?? "").startsWith("3ER LUGAR MP")
  );
  const rest = (groups ?? []).filter((g) => {
    const n = String(g.notes ?? "");
    return (
      !n.startsWith("STROKE AGREGADO · ") &&
      !n.startsWith("CONSOLACIÓN MP · ") &&
      !n.startsWith("3ER LUGAR MP")
    );
  });

  const strokeBase = parseHHMM(CALCUTA_SUNDAY_SCHEDULE.strokeStart) ?? 8 * 60;
  const consolBase =
    parseHHMM(CALCUTA_SUNDAY_SCHEDULE.consolationMpStart) ?? 9 * 60 + 30;

  let strokeIdx = 0;
  for (const g of stroke) {
    await admin
      .from("pairing_groups")
      .update({
        tee_time: formatHHMM(strokeBase + strokeIdx * intervalMinutes),
        starting_hole: CALCUTA_SUNDAY_SCHEDULE.strokeStartingHole,
      })
      .eq("id", g.id);
    strokeIdx += 1;
  }

  let consolIdx = 0;
  for (const g of consol) {
    await admin
      .from("pairing_groups")
      .update({
        tee_time: formatHHMM(consolBase + consolIdx * intervalMinutes),
        starting_hole: CALCUTA_SUNDAY_SCHEDULE.consolationMpStartingHole,
      })
      .eq("id", g.id);
    consolIdx += 1;
  }

  for (const g of third) {
    await admin
      .from("pairing_groups")
      .update({
        tee_time: CALCUTA_SUNDAY_SCHEDULE.thirdPlace,
        starting_hole: CALCUTA_SUNDAY_SCHEDULE.mainStartingHole,
      })
      .eq("id", g.id);
  }

  for (const g of rest) {
    await admin
      .from("pairing_groups")
      .update({
        tee_time: CALCUTA_SUNDAY_SCHEDULE.final,
        starting_hole: CALCUTA_SUNDAY_SCHEDULE.mainStartingHole,
      })
      .eq("id", g.id);
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
