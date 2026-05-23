/** Perfiles de desempate 68º Torneo Anual CCQ (convocatoria). */

export type CcqTieBreakProfileKey =
  | "gross_cut"
  | "stableford_cut"
  | "seniors_cut"
  | "trophy_gross";

const HOLE_SCOPES_CUT = [
  "10_18",
  "13_18",
  "16_18",
  "18",
  "1_9",
  "4_9",
  "7_9",
  "9",
] as const;

function segmentSteps(
  profileKey: CcqTieBreakProfileKey,
  basis: "gross" | "net" | "points",
  direction: "lower_is_better" | "higher_is_better",
  handicap_mode: string
) {
  return HOLE_SCOPES_CUT.map((hole_scope, i) => ({
    tie_break_profile_key: profileKey,
    step_no: i + 1,
    method: "segment_compare",
    basis,
    round_scope: "last_round_played",
    hole_scope,
    handicap_mode,
    direction,
    value_text: null as string | null,
  }));
}

export const CCQ_TIE_BREAK_PROFILES: Array<{
  key: CcqTieBreakProfileKey;
  name: string;
  applies_to: "cut" | "trophy" | "general";
  sort_order: number;
}> = [
  {
    key: "gross_cut",
    name: "CCQ · Corte gross (10-18…)",
    applies_to: "cut",
    sort_order: 1,
  },
  {
    key: "stableford_cut",
    name: "CCQ · Corte Stableford (10-18…)",
    applies_to: "cut",
    sort_order: 2,
  },
  {
    key: "seniors_cut",
    name: "CCQ · Corte Seniors neto (gross 10-18 PH 80%)",
    applies_to: "cut",
    sort_order: 3,
  },
  {
    key: "trophy_gross",
    name: "CCQ · Trofeos gross (retrocesión 10-18…)",
    applies_to: "trophy",
    sort_order: 4,
  },
];

export const CCQ_TIE_BREAK_STEPS = [
  ...segmentSteps("gross_cut", "gross", "lower_is_better", "none"),
  ...segmentSteps("stableford_cut", "points", "higher_is_better", "none"),
  ...segmentSteps(
    "seniors_cut",
    "gross",
    "lower_is_better",
    "course_handicap_80_percent_proportional"
  ),
  ...segmentSteps("trophy_gross", "gross", "lower_is_better", "none"),
];

export function tieBreakProfileKeyForCutRule(rule: {
  ranking_basis: string;
  category_codes: string[];
}): CcqTieBreakProfileKey {
  if (rule.ranking_basis === "points_total") return "stableford_cut";
  if (rule.ranking_basis === "net_total") return "seniors_cut";
  return "gross_cut";
}
