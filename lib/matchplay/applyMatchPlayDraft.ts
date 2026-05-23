import { createAdminClient } from "@/utils/supabase/admin";
import type { ConvocatoriaDraft } from "@/lib/convocatoria/types";
import { normalizeMatchPlayConvocatoriaDraft } from "./normalizeMatchPlayDraft";
import type { TournamentSettings } from "@/types/tournament";
import { buildMatchPlayTournamentSettings } from "./tournamentFormat";
import {
  seedConsolationStrokeTieBreakProfiles,
  formatStrokeConsolationTiebreakSummary,
} from "./seedConsolationTieBreak";
import {
  DEFAULT_STROKE_AGGREGATE_TIEBREAKERS,
  type ApplyMatchPlayResult,
  type MatchPlayConsolationRule,
  type MatchPlayTiebreaker,
} from "./types";

const MATCH_PLAY_TB_LABELS: Record<MatchPlayTiebreaker, string> = {
  sudden_death: "Muerte súbita desde hoyo 1",
  sudden_death_18: "Muerte súbita desde hoyo 18",
  extra_3_holes: "3 hoyos extra",
  lowest_hi: "HI combinado más bajo",
  play_until_decided: "Jugar hasta definir",
};

function describeConsolationTiebreakers(
  consolations: MatchPlayConsolationRule[]
): string {
  const enabled = consolations.filter((c) => c.enabled);
  if (!enabled.length) return "";

  const lines = enabled.map((c) => {
    const label = c.prize_label?.trim() || "Consolación";
    if (c.consolation_format === "match_play") {
      const tb = c.match_play_tiebreaker ?? "sudden_death";
      return `• ${label} (match play): desempate por ${MATCH_PLAY_TB_LABELS[tb]}.`;
    }
    const seqText = formatStrokeConsolationTiebreakSummary({
      ...c,
      stroke_aggregate_tiebreakers:
        c.stroke_aggregate_tiebreakers?.length
          ? c.stroke_aggregate_tiebreakers
          : DEFAULT_STROKE_AGGREGATE_TIEBREAKERS,
    });
    return `• ${label} (stroke agregado, neto 80% HI): ${seqText}.`;
  });

  return ["Desempates de consolación:", ...lines].join("\n");
}

export async function applyMatchPlayDraft({
  tournamentId,
  draft: rawDraft,
  replaceExisting = true,
}: {
  tournamentId: string;
  draft: ConvocatoriaDraft;
  replaceExisting?: boolean;
}): Promise<ApplyMatchPlayResult> {
  const supabase = createAdminClient();
  const draft = normalizeMatchPlayConvocatoriaDraft(rawDraft);
  const mp = draft.matchplay!;

  const { count: entryCount } = await supabase
    .from("tournament_entries")
    .select("id", { count: "exact", head: true })
    .eq("tournament_id", tournamentId);

  if ((entryCount ?? 0) > 0 && replaceExisting) {
    throw new Error(
      "El torneo ya tiene inscripciones. No se puede reemplazar la configuración automáticamente."
    );
  }

  const codeToId = new Map<string, string>();

  if (replaceExisting) {
    const { data: existingCats } = await supabase
      .from("categories")
      .select("id")
      .eq("tournament_id", tournamentId);

    if ((existingCats ?? []).length > 0) {
      const ids = existingCats!.map((c) => c.id);
      await supabase.from("categories").delete().in("id", ids);
    }
  }

  const categoryPayload = draft.categories.map((c, i) => ({
    tournament_id: tournamentId,
    org_id: null,
    code: c.code.toUpperCase(),
    name: c.name,
    gender: c.gender,
    category_group: c.category_group,
    handicap_min: c.handicap_min,
    handicap_max: c.handicap_max,
    min_age: c.min_age,
    max_age: c.max_age,
    max_players: null,
    is_active: true,
    sort_order: i + 1,
  }));

  const { data: insertedCats, error: catErr } = await supabase
    .from("categories")
    .insert(categoryPayload)
    .select("id, code");

  if (catErr) throw new Error(`Categorías: ${catErr.message}`);
  for (const row of insertedCats ?? []) {
    codeToId.set(String(row.code).toUpperCase(), row.id);
  }

  const roundCount = draft.meta.round_count ?? mp.bracket_round_count;
  let rounds_created = 0;

  const { data: existingRounds } = await supabase
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .limit(1);

  if (!(existingRounds ?? []).length) {
    const roundRows: Array<Record<string, unknown>> = [];
    for (let round_no = 1; round_no <= roundCount; round_no++) {
      for (const cat of draft.categories) {
        const category_id = codeToId.get(cat.code.toUpperCase());
        if (!category_id) continue;
        roundRows.push({
          tournament_id: tournamentId,
          round_no,
          category_id,
          round_date: null,
          wave: "AM",
          start_type: "tee_time",
          start_time: null,
          interval_minutes: 10,
          group_size: 2,
        });
      }
    }
    if (roundRows.length) {
      const { error: roundErr } = await supabase.from("rounds").insert(roundRows);
      if (roundErr) throw new Error(`Rondas: ${roundErr.message}`);
      rounds_created = roundRows.length;
    }
  }

  const { data: tournamentRow } = await supabase
    .from("tournaments")
    .select("settings")
    .eq("id", tournamentId)
    .maybeSingle();

  const settings = buildMatchPlayTournamentSettings(
    (tournamentRow?.settings ?? {}) as TournamentSettings,
    {
      bracket_round_count: roundCount,
      holes_per_match: mp.holes_per_match,
    }
  );

  const { error: settingsErr } = await supabase
    .from("tournaments")
    .update({ settings })
    .eq("id", tournamentId);

  if (settingsErr) throw new Error(`Settings: ${settingsErr.message}`);

  await supabase
    .from("category_competition_rules")
    .delete()
    .eq("tournament_id", tournamentId);

  await supabase
    .from("round_advancement_rules")
    .delete()
    .eq("tournament_id", tournamentId);

  await supabase
    .from("category_prize_rules")
    .delete()
    .eq("tournament_id", tournamentId);

  // Sembrar una regla de competencia mínima por categoría — el motor de UI
  // requiere al menos una fila para que el módulo /competition-rules muestre
  // contenido. En match play el "scoring" real está en tournament_matchplay_rules.
  const competitionRows = (insertedCats ?? []).map((c) => ({
    tournament_id: tournamentId,
    category_id: c.id,
    scoring_format: "match_play" as const,
    leaderboard_basis: "match_play" as const,
    prize_basis: "match_play" as const,
    handicap_percentage: mp.handicap_allowance_custom_pct ?? null,
    gross_prize_places: 1,
    net_prize_places: null,
    notes:
      "Reglas match play (ver convocatoria match play). Configurado automáticamente desde la convocatoria.",
    is_active: true,
  }));

  if (competitionRows.length) {
    const { error: compErr } = await supabase
      .from("category_competition_rules")
      .insert(competitionRows);
    if (compErr) {
      // No bloqueamos el apply si el schema no soporta scoring_format=match_play
      console.warn("[applyMatchPlayDraft] competition rules:", compErr.message);
    }
  }

  const prizeRows = draft.prize_rules
    .map((p, i) => {
      const categoryId = codeToId.get(p.category_code.toUpperCase());
      if (!categoryId) return null;
      return {
        tournament_id: tournamentId,
        scope_type: "category" as const,
        scope_value: categoryId,
        prize_label: p.prize_label,
        prize_position: p.prize_position,
        ranking_basis: p.ranking_basis,
        priority: p.prize_position,
        unique_winner: true,
        show_on_leaderboard: true,
        ranking_mode: "tournament_to_date" as const,
        round_nos: null,
        sort_order: i + 1,
        is_active: true,
        notes: "Match play — ganador del cuadro",
      };
    })
    .filter(Boolean);

  if (prizeRows.length) {
    const { error } = await supabase
      .from("category_prize_rules")
      .insert(prizeRows);
    if (error) throw new Error(`Premios: ${error.message}`);
  }

  const auction = mp.auction;
  const rulesPayload = {
    tournament_id: tournamentId,
    config_json: mp,
    match_type: mp.match_type ?? "pairs",
    pair_format: mp.pair_format,
    bracket_type: mp.bracket_type,
    category_basis: mp.category_basis,
    pair_composition: mp.pair_composition ?? "open",
    combined_hi_min: mp.combined_hi_min ?? null,
    combined_hi_max: mp.combined_hi_max ?? null,
    male_individual_hi_max: mp.male_individual_hi_max ?? null,
    female_individual_hi_max: mp.female_individual_hi_max ?? null,
    handicap_allowance: mp.handicap_allowance,
    handicap_allowance_pct: mp.handicap_allowance_custom_pct ?? null,
    match_tiebreaker: mp.match_tiebreaker,
    holes_per_match: mp.holes_per_match,
    bracket_round_count: roundCount,
    bracket_main_pairs: mp.bracket_main_pairs ?? null,
    play_in_enabled: mp.play_in_enabled ?? false,
    max_pairs_per_category: mp.max_pairs_per_category,
    seeding_method: mp.seeding_method,
    auction_enabled: auction?.enabled ?? false,
    auction_pot_percent: auction?.pot_percent_of_total ?? null,
    auction_min_bid: auction?.min_bid ?? null,
    auction_max_bid: auction?.max_bid ?? null,
    auction_currency: auction?.currency ?? null,
    notes: mp.reference_notes,
    rules_text: (() => {
      const base = mp.rules_text?.trim() ?? "";
      const consoText = describeConsolationTiebreakers(mp.consolations ?? []);
      if (!base && !consoText) return null;
      return [base, consoText].filter(Boolean).join("\n\n");
    })(),
    updated_at: new Date().toISOString(),
  };

  const { error: rulesErr } = await supabase
    .from("tournament_matchplay_rules")
    .upsert(rulesPayload, { onConflict: "tournament_id" });

  if (rulesErr) {
    if (/tournament_matchplay_rules|does not exist/i.test(rulesErr.message)) {
      throw new Error(
        "Falta la migración match play en Supabase (20260522120000_matchplay.sql)."
      );
    }
    throw new Error(`Reglas match play: ${rulesErr.message}`);
  }

  await seedConsolationStrokeTieBreakProfiles(
    supabase,
    tournamentId,
    mp.consolations ?? []
  );

  return {
    categories: insertedCats?.length ?? 0,
    matchplay_rules: 1,
    rounds_created,
  };
}
