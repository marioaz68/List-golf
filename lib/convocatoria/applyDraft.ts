import { createAdminClient } from "@/utils/supabase/admin";
import { tieBreakProfileKeyForCutRule } from "./ccqTieBreakProfiles";
import { seedCcqTieBreakProfiles } from "./seedTieBreakProfiles";
import type { ApplyConvocatoriaResult, ConvocatoriaDraft } from "./types";

export async function applyConvocatoriaDraft({
  tournamentId,
  draft,
  replaceExisting = true,
}: {
  tournamentId: string;
  draft: ConvocatoriaDraft;
  replaceExisting?: boolean;
}): Promise<ApplyConvocatoriaResult> {
  const supabase = createAdminClient();

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
      .select("id, code")
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

  const roundCount = draft.meta.round_count ?? 3;
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
        const category_id = codeToId.get(cat.code);
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
          group_size: 4,
        });
      }
    }
    if (roundRows.length) {
      const { error: roundErr } = await supabase.from("rounds").insert(roundRows);
      if (roundErr) throw new Error(`Rondas: ${roundErr.message}`);
      rounds_created = roundRows.length;
    }
  }

  await supabase
    .from("category_competition_rules")
    .delete()
    .eq("tournament_id", tournamentId);

  const compRows = draft.competition_rules
    .map((r) => {
      const category_id = codeToId.get(r.category_code.toUpperCase());
      if (!category_id) return null;
      return {
        tournament_id: tournamentId,
        category_id,
        scoring_format: r.scoring_format,
        leaderboard_basis: r.leaderboard_basis,
        prize_basis: r.prize_basis,
        handicap_percentage: r.handicap_percentage,
        gross_prize_places: r.gross_prize_places,
        net_prize_places: r.net_prize_places,
        is_active: true,
        notes: r.notes,
      };
    })
    .filter(Boolean);

  if (compRows.length) {
    const { error } = await supabase
      .from("category_competition_rules")
      .insert(compRows);
    if (error) throw new Error(`Competencia: ${error.message}`);
  }

  await supabase
    .from("round_advancement_rules")
    .delete()
    .eq("tournament_id", tournamentId);

  const tieBreakProfileIds = await seedCcqTieBreakProfiles(
    supabase,
    tournamentId
  );

  const cutRows = draft.cut_rules.map((r, i) => {
    const profileKey =
      r.tie_break_profile_key ??
      tieBreakProfileKeyForCutRule({
        ranking_basis: r.ranking_basis,
        category_codes: r.category_codes,
      });
    const profileId = profileKey
      ? tieBreakProfileIds[profileKey] ?? null
      : null;

    return {
      tournament_id: tournamentId,
      from_round_no: r.from_round_no,
      to_round_no: r.to_round_no,
      scope_type: r.scope_type,
      scope_value:
        r.scope_type === "category"
          ? codeToId.get(r.scope_value.toUpperCase()) ?? r.scope_value
          : r.scope_type === "category_code_list"
            ? r.category_codes.join(",")
            : r.scope_value,
      ranking_basis: r.ranking_basis,
      ranking_mode: r.ranking_mode,
      advancement_type: r.advancement_type,
      advancement_value: r.advancement_value,
      include_ties: false,
      gross_exemption_enabled: r.gross_exemption_enabled,
      gross_exemption_top_n: r.gross_exemption_top_n,
      tie_break_profile_id: profileId,
      sort_order: i + 1,
      is_active: true,
      notes: r.notes,
    };
  });

  if (cutRows.length) {
    const { error } = await supabase
      .from("round_advancement_rules")
      .insert(cutRows);
    if (error) throw new Error(`Corte: ${error.message}`);
  }

  await supabase
    .from("category_prize_rules")
    .delete()
    .eq("tournament_id", tournamentId);

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
        notes: null,
      };
    })
    .filter(Boolean);

  if (prizeRows.length) {
    const { error } = await supabase
      .from("category_prize_rules")
      .insert(prizeRows);
    if (error) throw new Error(`Premios: ${error.message}`);
  }

  return {
    categories: insertedCats?.length ?? 0,
    competition_rules: compRows.length,
    cut_rules: cutRows.length,
    prize_rules: prizeRows.length,
    rounds_created,
  };
}
