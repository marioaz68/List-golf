import type { MatchPlayConvocatoriaConfig } from "@/lib/matchplay/types";

export type TournamentMode = "stroke" | "matchplay";

export type DraftCategory = {
  code: string;
  name: string;
  gender: "M" | "F" | "X";
  category_group: "main" | "senior" | "ladies" | "super_senior" | "mixed";
  handicap_min: number;
  handicap_max: number;
  min_age: number | null;
  max_age: number | null;
  tee_hint: string | null;
  format_notes: string | null;
  has_cut: boolean;
};

export type DraftCompetitionRule = {
  category_code: string;
  scoring_format: "stroke_play" | "stableford";
  leaderboard_basis: "gross" | "net" | "both" | "stableford";
  prize_basis: "gross" | "net" | "both" | "stableford";
  handicap_percentage: number;
  gross_prize_places: number;
  net_prize_places: number | null;
  notes: string | null;
};

export type DraftCutRule = {
  category_codes: string[];
  scope_type: "category" | "category_group" | "category_code_list";
  scope_value: string;
  from_round_no: number;
  to_round_no: number;
  ranking_basis:
    | "gross_total"
    | "net_total"
    | "points_total";
  ranking_mode: "specified_rounds" | "tournament_to_date" | "last_round_only";
  advancement_type: "top_percent" | "top_n" | "all";
  advancement_value: number;
  include_ties: boolean;
  gross_exemption_enabled: boolean;
  gross_exemption_top_n: number;
  /** Perfil de desempate CCQ al generar parámetros. */
  tie_break_profile_key?:
    | "gross_cut"
    | "stableford_cut"
    | "seniors_cut"
    | null;
  notes: string | null;
};

export type DraftPrizeRule = {
  category_code: string;
  prize_position: number;
  prize_label: string;
  ranking_basis: "gross" | "net" | "stableford";
  scope_type: "category";
  scope_value: string;
};

/** Textos de referencia de la convocatoria (editables; no se importan solos a premios HIO/O'Yes). */
export type ConvocatoriaReference = {
  system: string;
  gentlemen: string;
  ladies: string;
  seniors_ages: string;
  cut_policy: string;
  cut_tiebreak_gross: string;
  cut_tiebreak_stableford: string;
  cut_tiebreak_seniors: string;
  trophy_tiebreak: string;
  trophies: string;
  out_of_scope: string;
};

export type ConvocatoriaDraft = {
  version: 1;
  /** stroke = torneo por golpes/puntos (default). matchplay = cuadro por parejas. */
  tournament_mode?: TournamentMode;
  source: "docx" | "manual" | "template";
  meta: {
    title: string | null;
    total_holes: number | null;
    cut_after_holes: number | null;
    cut_percent: number | null;
    round_count: number | null;
    practice_day: string | null;
    handicap_index_date: string | null;
  };
  reference?: ConvocatoriaReference;
  /** Solo cuando tournament_mode === "matchplay". */
  matchplay?: MatchPlayConvocatoriaConfig;
  categories: DraftCategory[];
  competition_rules: DraftCompetitionRule[];
  cut_rules: DraftCutRule[];
  prize_rules: DraftPrizeRule[];
  warnings: string[];
};

export type ApplyConvocatoriaResult = {
  categories: number;
  competition_rules: number;
  cut_rules: number;
  prize_rules: number;
  rounds_created: number;
};
