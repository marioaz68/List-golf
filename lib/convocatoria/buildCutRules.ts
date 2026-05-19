import type { ConvocatoriaDraft, DraftCutRule } from "./types";

/** Reglas de corte alineadas a convocatoria 68º CCQ. */
export function buildCutRulesCcQ(meta: ConvocatoriaDraft["meta"]): DraftCutRule[] {
  const roundCount = meta.round_count ?? 3;
  const cutPct = meta.cut_percent ?? 50;

  return [
    {
      category_codes: ["CAMP", "AA", "A", "B", "C"],
      scope_type: "category_code_list",
      scope_value: "CAMP,AA,A,B,C",
      from_round_no: 1,
      to_round_no: roundCount,
      ranking_basis: "gross_total",
      ranking_mode: "specified_rounds",
      advancement_type: "top_percent",
      advancement_value: cutPct,
      include_ties: true,
      gross_exemption_enabled: true,
      gross_exemption_top_n: 4,
      tie_break_profile_key: "gross_cut",
      notes:
        "Acumulado R1+R2 (36 hoyos). Top 50% redondeo a la baja sobre inscritos; empates en el score de corte pasan. Desempate ordena: 10-18, 13-18, 16-18, 18, 1-9, 4-9, 7-9, 9.",
    },
    {
      category_codes: ["DE"],
      scope_type: "category",
      scope_value: "DE",
      from_round_no: 1,
      to_round_no: roundCount,
      ranking_basis: "points_total",
      ranking_mode: "specified_rounds",
      advancement_type: "top_percent",
      advancement_value: cutPct,
      include_ties: true,
      gross_exemption_enabled: false,
      gross_exemption_top_n: 0,
      tie_break_profile_key: "stableford_cut",
      notes:
        "Acumulado R1+R2 por puntos Stableford. Top 50% redondeo a la baja; empates en el score de corte pasan.",
    },
    {
      category_codes: ["SEN", "SS"],
      scope_type: "category_code_list",
      scope_value: "SEN,SS",
      from_round_no: 1,
      to_round_no: roundCount,
      ranking_basis: "net_total",
      ranking_mode: "specified_rounds",
      advancement_type: "top_percent",
      advancement_value: cutPct,
      include_ties: true,
      gross_exemption_enabled: true,
      gross_exemption_top_n: 4,
      tie_break_profile_key: "seniors_cut",
      notes:
        "Corte neto 36 hoyos. Top 50% redondeo a la baja; empates en score de corte pasan. Top 4 gross fuera del corte neto. Desempate gross 10-18 con PH 80%.",
    },
  ];
}
