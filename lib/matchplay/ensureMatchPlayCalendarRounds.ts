import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";

export type EnsureMatchPlayCalendarRoundsResult = {
  ok: true;
  created: number;
  existing: number;
  roundCount: number;
};

function addCalendarDays(iso: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const dt = new Date(
    Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + days)
  );
  return dt.toISOString().slice(0, 10);
}

function clampDate(value: string, max: string | null): string {
  if (!max) return value;
  return value <= max ? value : max;
}

/**
 * Crea las filas de `rounds` que faltan para el cuadro (R1…RN).
 * No toca rondas que ya existen. Las fechas parten de `tournaments.start_date`
 * y se recortan a `end_date` si hay.
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
    return { ok: true, created: 0, existing: 0, roundCount: 0 };
  }

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("bracket_round_count, bracket_main_pairs")
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
    .select("id, round_no")
    .eq("tournament_id", tournamentId);

  const have = new Set((existing ?? []).map((r) => Number(r.round_no)));

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
  const endDate =
    typeof tournament.end_date === "string" && tournament.end_date
      ? tournament.end_date
      : null;

  const rows: Array<Record<string, unknown>> = [];
  for (let round_no = 1; round_no <= roundCount; round_no++) {
    if (have.has(round_no)) continue;
    rows.push({
      tournament_id: tournamentId,
      round_no,
      category_id: categoryId,
      round_date: clampDate(addCalendarDays(startDate, round_no - 1), endDate),
      wave: "AM",
      start_type: "tee_time",
      start_time: "07:00",
      interval_minutes: 10,
      group_size: 4,
    });
  }

  if (rows.length === 0) {
    return {
      ok: true,
      created: 0,
      existing: have.size,
      roundCount,
    };
  }

  const { error } = await admin.from("rounds").insert(rows);
  if (error) throw new Error(`No se pudieron crear las rondas: ${error.message}`);

  return {
    ok: true,
    created: rows.length,
    existing: have.size,
    roundCount,
  };
}
