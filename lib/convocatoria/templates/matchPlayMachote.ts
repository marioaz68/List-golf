import type { ConvocatoriaDraft } from "../types";
import type { MatchPlayConvocatoriaConfig } from "@/lib/matchplay/types";

const DEFAULT_MATCHPLAY: MatchPlayConvocatoriaConfig = {
  match_type: "pairs",
  pair_format: "fourball",
  bracket_type: "single_elim",
  category_basis: "combined_hi",
  handicap_allowance: "fourball_85",
  handicap_allowance_custom_pct: null,
  match_tiebreaker: "sudden_death",
  holes_per_match: 18,
  bracket_round_count: 4,
  max_pairs_per_category: null,
  seeding_method: "hi_combined",
  prize_places: 1,
  reference_notes:
    "Torneo match play. Elige individual o parejas y edita reglas antes de cerrar.",
  trophies: [
    {
      position: 1,
      label: "Trofeo Campeón",
      count_per_team: 2,
      source: "match_play",
    },
  ],
};

/** Plantilla base para torneos match play (independiente del 68º Anual). */
export function matchPlayMachote(opts?: {
  title?: string | null;
  matchplay?: Partial<MatchPlayConvocatoriaConfig>;
}): ConvocatoriaDraft {
  const match_type = opts?.matchplay?.match_type ?? DEFAULT_MATCHPLAY.match_type;
  const title =
    opts?.title?.trim() ||
    (match_type === "individual"
      ? "Torneo Match Play Individual"
      : "Torneo Match Play por parejas");
  const mp: MatchPlayConvocatoriaConfig = {
    ...DEFAULT_MATCHPLAY,
    ...opts?.matchplay,
  };

  return {
    version: 1,
    tournament_mode: "matchplay",
    source: "template",
    meta: {
      title,
      total_holes: mp.holes_per_match,
      cut_after_holes: null,
      cut_percent: null,
      round_count: mp.bracket_round_count,
      practice_day: null,
      handicap_index_date: null,
    },
    matchplay: mp,
    categories: [
      {
        code: "CHAMP",
        name: "Championship",
        gender: "X",
        category_group: "main",
        handicap_min: 0,
        handicap_max: 12,
        min_age: null,
        max_age: null,
        tee_hint: null,
        format_notes: "HI combinado de la pareja",
        has_cut: false,
      },
      {
        code: "FLT1",
        name: "First Flight",
        gender: "X",
        category_group: "main",
        handicap_min: 12.1,
        handicap_max: 24,
        min_age: null,
        max_age: null,
        tee_hint: null,
        format_notes: "HI combinado de la pareja",
        has_cut: false,
      },
      {
        code: "FLT2",
        name: "Second Flight",
        gender: "X",
        category_group: "main",
        handicap_min: 24.1,
        handicap_max: 54,
        min_age: null,
        max_age: null,
        tee_hint: null,
        format_notes: "HI combinado de la pareja",
        has_cut: false,
      },
    ],
    competition_rules: [],
    cut_rules: [],
    prize_rules: [
      {
        category_code: "CHAMP",
        prize_position: 1,
        prize_label: "Campeones",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "CHAMP",
      },
      {
        category_code: "FLT1",
        prize_position: 1,
        prize_label: "Campeones 1er Flight",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "FLT1",
      },
      {
        category_code: "FLT2",
        prize_position: 1,
        prize_label: "Campeones 2do Flight",
        ranking_basis: "gross",
        scope_type: "category",
        scope_value: "FLT2",
      },
    ],
    warnings: [
      "Torneo match play: no se generan cortes ni reglas stroke/stableford.",
      "Tras aplicar la convocatoria, inscribe parejas y genera el cuadro (próximas fases).",
    ],
  };
}
