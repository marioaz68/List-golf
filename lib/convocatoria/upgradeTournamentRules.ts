import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCutRulesCcQ } from "./buildCutRules";
import { tieBreakProfileKeyForCutRule } from "./ccqTieBreakProfiles";
import { seedCcqTieBreakProfiles } from "./seedTieBreakProfiles";

type AdvancementRow = {
  id: string;
  ranking_basis: string;
  ranking_mode: string;
  from_round_no: number;
  tie_break_profile_id: string | null;
  scope_type: string;
  scope_value: string | null;
};

function needsCutRulesUpgrade(rules: AdvancementRow[]): boolean {
  if (rules.length === 0) return false;
  return rules.some(
    (r) =>
      r.ranking_mode !== "specified_rounds" ||
      r.from_round_no !== 1 ||
      !r.tie_break_profile_id
  );
}

/** Parchea reglas de corte en BD (torneo ya configurado): 36 hoyos R1+R2 y desempates CCQ. */
export async function upgradeTournamentCutRulesFromMachote(
  supabase: SupabaseClient,
  tournamentId: string,
  roundCount = 3
): Promise<{ upgraded: boolean; profiles: number }> {
  const { data: rules, error } = await supabase
    .from("round_advancement_rules")
    .select(
      "id, ranking_basis, ranking_mode, from_round_no, tie_break_profile_id, scope_type, scope_value"
    )
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);

  if (error) throw new Error(`Reglas de corte: ${error.message}`);

  const list = (rules ?? []) as AdvancementRow[];
  if (!needsCutRulesUpgrade(list)) {
    return { upgraded: false, profiles: 0 };
  }

  const profileIds = await seedCcqTieBreakProfiles(supabase, tournamentId);
  const machoteCuts = buildCutRulesCcQ({
    title: null,
    total_holes: 54,
    cut_after_holes: 36,
    cut_percent: 50,
    round_count: roundCount,
    practice_day: null,
    handicap_index_date: null,
  });

  for (const row of list) {
    const machoteMatch = machoteCuts.find((m) => {
      if (row.scope_type === "category") {
        return (
          m.scope_type === "category" &&
          m.scope_value.toUpperCase() ===
            String(row.scope_value ?? "").toUpperCase()
        );
      }
      if (row.scope_type === "category_code_list") {
        return m.scope_type === "category_code_list";
      }
      return false;
    });

    const basis = row.ranking_basis;
    const profileKey = tieBreakProfileKeyForCutRule({
      ranking_basis: basis,
      category_codes: machoteMatch?.category_codes ?? [],
    });

    const { error: upErr } = await supabase
      .from("round_advancement_rules")
      .update({
        ranking_mode: "specified_rounds",
        from_round_no: 1,
        tie_break_profile_id: profileIds[profileKey] ?? null,
      })
      .eq("id", row.id);

    if (upErr) {
      throw new Error(`Actualizar regla de corte: ${upErr.message}`);
    }
  }

  return { upgraded: true, profiles: Object.keys(profileIds).length };
}
