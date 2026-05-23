import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_STROKE_AGGREGATE_TIEBREAKERS,
  STROKE_AGGREGATE_TIEBREAKER_LABELS,
  type MatchPlayConsolationRule,
  type StrokeAggregateTiebreaker,
} from "./types";

/** Mapeo clave convocatoria → hole_scope en tie_break_steps. */
const HOLE_SCOPE_BY_KEY: Partial<Record<StrokeAggregateTiebreaker, string>> = {
  h10_18: "10_18",
  h13_18: "13_18",
  h16_18: "16_18",
  h18: "18",
  h1_9: "1_9",
  h4_9: "4_9",
  h7_9: "7_9",
  h9: "9",
};

/**
 * Crea perfiles de desempate en BD para cada consolación stroke play agregado.
 * Usa neto con 80% HI (handicap_mode course) y la secuencia de retrocesión de la convocatoria.
 */
export async function seedConsolationStrokeTieBreakProfiles(
  supabase: SupabaseClient,
  tournamentId: string,
  consolations: MatchPlayConsolationRule[]
): Promise<number> {
  const strokeConsos = consolations.filter(
    (c) => c.enabled && c.consolation_format === "stroke_play_aggregate"
  );

  if (!strokeConsos.length) return 0;

  const profilePrefix = "Consolación stroke · ";

  const { data: existing } = await supabase
    .from("tie_break_profiles")
    .select("id, name")
    .eq("tournament_id", tournamentId)
    .ilike("name", `${profilePrefix}%`);

  for (const row of existing ?? []) {
    await supabase.from("tie_break_profiles").delete().eq("id", row.id);
  }

  let created = 0;

  for (let i = 0; i < strokeConsos.length; i++) {
    const c = strokeConsos[i];
    const label = c.prize_label?.trim() || `Consolación ${i + 1}`;
    const keys =
      c.stroke_aggregate_tiebreakers?.length
        ? c.stroke_aggregate_tiebreakers
        : [...DEFAULT_STROKE_AGGREGATE_TIEBREAKERS];

    const { data: profile, error: profileErr } = await supabase
      .from("tie_break_profiles")
      .insert({
        tournament_id: tournamentId,
        name: `${profilePrefix}${label}`,
        applies_to: "trophy",
        is_active: true,
        sort_order: 10 + i,
        notes:
          "Desempate stroke play agregado (consolación). Neto 80% HI. Generado desde convocatoria match play.",
      })
      .select("id")
      .single();

    if (profileErr || !profile?.id) {
      throw new Error(
        `Perfil desempate consolación «${label}»: ${profileErr?.message ?? "sin id"}`
      );
    }

    const steps: Array<Record<string, unknown>> = [];
    let stepNo = 1;

    for (const key of keys) {
      const holeScope = HOLE_SCOPE_BY_KEY[key];
      if (holeScope) {
        steps.push({
          tie_break_profile_id: profile.id,
          step_no: stepNo++,
          method: "segment_compare",
          basis: "net",
          round_scope: "last_round_played",
          hole_scope: holeScope,
          handicap_mode: "course_handicap_80_percent_proportional",
          direction: "lower_is_better",
          value_text: null,
        });
        continue;
      }

      if (key === "lowest_hi" || key === "lower_hi_player") {
        steps.push({
          tie_break_profile_id: profile.id,
          step_no: stepNo++,
          method: "lower_handicap_index",
          basis: null,
          round_scope: null,
          hole_scope: null,
          handicap_mode: null,
          direction: null,
          value_text:
            key === "lowest_hi"
              ? "lowest_combined_hi"
              : "lowest_player_hi",
        });
        continue;
      }

      if (key === "drawing_lots") {
        steps.push({
          tie_break_profile_id: profile.id,
          step_no: stepNo++,
          method: "random_draw",
          basis: null,
          round_scope: null,
          hole_scope: null,
          handicap_mode: null,
          direction: null,
          value_text: "drawing_lots",
        });
      }
    }

    if (steps.length) {
      const { error: stepsErr } = await supabase
        .from("tie_break_steps")
        .insert(steps);
      if (stepsErr) {
        throw new Error(
          `Pasos desempate «${label}»: ${stepsErr.message}`
        );
      }
    }

    created++;
  }

  return created;
}

export function formatStrokeConsolationTiebreakSummary(
  c: MatchPlayConsolationRule
): string {
  const keys =
    c.stroke_aggregate_tiebreakers?.length
      ? c.stroke_aggregate_tiebreakers
      : DEFAULT_STROKE_AGGREGATE_TIEBREAKERS;
  return keys.map((k) => STROKE_AGGREGATE_TIEBREAKER_LABELS[k]).join(" → ");
}
