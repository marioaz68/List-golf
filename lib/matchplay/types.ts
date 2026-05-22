/** Formato de juego dentro de cada match (pareja vs pareja). */
export type MatchPlayPairFormat =
  | "fourball"
  | "foursomes"
  | "greensome"
  | "chapman"
  | "scramble";

export type MatchPlayBracketType =
  | "single_elim"
  | "single_elim_consolation"
  | "double_elim"
  | "round_robin"
  | "stroke_qualifier";

export type MatchPlayCategoryBasis =
  | "combined_hi"
  | "individual_hi"
  | "flights"
  | "open"
  | "by_age";

export type MatchPlayHandicapAllowance =
  | "scratch"
  | "fourball_85"
  | "foursomes_50_combined"
  | "full_relative"
  | "custom";

export type MatchPlayTiebreaker =
  | "sudden_death"
  | "sudden_death_18"
  | "extra_3_holes"
  | "lowest_hi"
  | "play_until_decided";

export type MatchPlaySeedingMethod =
  | "hi_combined"
  | "random"
  | "manual"
  | "auction"
  | "qualifier_stroke";

export type MatchPlayPairComposition =
  | "open"
  | "mixed_one_each"
  | "ladies_only"
  | "gentlemen_only";

export type MatchPlayConsolationRule = {
  enabled: boolean;
  /** Ronda del bracket principal de la que vienen los participantes (1 = primera, etc.). */
  from_round_no: number;
  /** "match_play" = consolación a 1 partido; "stroke_play_aggregate" = 18 hoyos stroke. */
  consolation_format: "match_play" | "stroke_play_aggregate";
  /** Etiqueta del premio asociado, si aplica. */
  prize_label: string | null;
  /** % de la bolsa del torneo. */
  prize_percent: number | null;
};

export type MatchPlayPrizeShare = {
  position: number;
  label: string;
  percent: number;
  source: "match_play" | "consolation_match_play" | "stroke_play_aggregate";
};

export type MatchPlayAuctionConfig = {
  enabled: boolean;
  /** % de la suma subastada que se reparte como bolsa de premios. */
  pot_percent_of_total: number;
  min_bid: number | null;
  max_bid: number | null;
  player_cover_percent: number | null;
  currency: "MXN" | "USD";
};

export type MatchPlayMatchType = "individual" | "pairs";

/** Configuración match play dentro del borrador de convocatoria. */
export type MatchPlayConvocatoriaConfig = {
  /** Individual (1 jugador) o parejas (2 jugadores por equipo). */
  match_type: MatchPlayMatchType;
  pair_format: MatchPlayPairFormat;
  bracket_type: MatchPlayBracketType;
  category_basis: MatchPlayCategoryBasis;
  handicap_allowance: MatchPlayHandicapAllowance;
  handicap_allowance_custom_pct: number | null;
  match_tiebreaker: MatchPlayTiebreaker;
  holes_per_match: 9 | 18;
  /** Rondas del cuadro (ej. 4 = octavos→final en bracket de 16). */
  bracket_round_count: number;
  /** null = tamaño variable con BYEs */
  max_pairs_per_category: number | null;
  seeding_method: MatchPlaySeedingMethod;
  prize_places: number;
  reference_notes: string | null;

  pair_composition?: MatchPlayPairComposition;
  /** Suma mínima de HI de la pareja. */
  combined_hi_min?: number | null;
  /** Suma máxima de HI de la pareja. */
  combined_hi_max?: number | null;
  /** Si se requiere una ronda clasificatoria para reducir a `bracket_main_pairs`. */
  play_in_enabled?: boolean;
  /** Parejas que entran al cuadro principal (ej. 16). */
  bracket_main_pairs?: number | null;
  /** Subasta / calcuta para definir siembra. */
  auction?: MatchPlayAuctionConfig;
  /** Consolaciones (pueden existir varias). */
  consolations?: MatchPlayConsolationRule[];
  /** Distribución de bolsa por posición. */
  prize_shares?: MatchPlayPrizeShare[];
  /** Texto largo de reglas adicionales (mostradas en convocatoria pública). */
  rules_text?: string | null;
};

export type ApplyMatchPlayResult = {
  categories: number;
  matchplay_rules: number;
  rounds_created: number;
};

export const MATCHPLAY_MATCH_TYPE_LABELS: Record<MatchPlayMatchType, string> = {
  individual: "Individual (1 jugador por equipo)",
  pairs: "Por parejas (2 jugadores por equipo)",
};

export const MATCHPLAY_PAIR_FORMAT_LABELS: Record<MatchPlayPairFormat, string> = {
  fourball: "Four-Ball / Mejor bola",
  foursomes: "Foursomes / Golpe alterno",
  greensome: "Greensome / Pinehurst",
  chapman: "Chapman",
  scramble: "Scramble",
};

export const MATCHPLAY_BRACKET_LABELS: Record<MatchPlayBracketType, string> = {
  single_elim: "Eliminación directa",
  single_elim_consolation: "Eliminación directa + consolación",
  double_elim: "Doble eliminación",
  round_robin: "Round robin + playoff",
  stroke_qualifier: "Clasificación stroke → match play",
};

export const MATCHPLAY_SEEDING_LABELS: Record<MatchPlaySeedingMethod, string> = {
  hi_combined: "HI combinado de la pareja",
  random: "Aleatorio",
  manual: "Manual",
  auction: "Subasta / Calcuta",
  qualifier_stroke: "Ronda clasificatoria stroke",
};

export const MATCHPLAY_PAIR_COMPOSITION_LABELS: Record<
  MatchPlayPairComposition,
  string
> = {
  open: "Abierta (sin restricción de género)",
  mixed_one_each: "Mixto (1 dama + 1 caballero)",
  ladies_only: "Solo damas",
  gentlemen_only: "Solo caballeros",
};
