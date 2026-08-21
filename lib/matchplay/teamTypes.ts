export type MatchPlayEntryPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
  handicap_torneo?: number | null;
};

export type MatchPlayEntryRow = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  effective_hi: number;
  course_handicap: number | null;
  playing_handicap: number | null;
  playing_handicap_override: number | null;
  playing_handicap_override_reason: string | null;
  player: MatchPlayEntryPlayer;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
  /** Salida forzada en inscritos; manda sobre category_tee_rules. */
  tee_set_id_override?: string | null;
};

export type MatchPlayTeamRow = {
  id: string;
  tournament_id: string;
  category_id: string | null;
  player_a_entry_id: string | null;
  player_b_entry_id: string | null;
  team_name: string | null;
  combined_hi: number | null;
  seed: number | null;
  auction_bid: number | null;
  auction_order: number | null;
  auction_order_at?: string | null;
  auction_order_by?: string | null;
  is_active: boolean;
  player_a: MatchPlayEntryRow | null;
  player_b: MatchPlayEntryRow | null;
};

export type MatchPlayRulesSnapshot = {
  match_type: "individual" | "pairs";
  pair_composition: string | null;
  combined_hi_min: number | null;
  combined_hi_max: number | null;
  male_individual_hi_max: number | null;
  female_individual_hi_max: number | null;
  max_teams: number | null;
  /** Parejas o jugadores del campo (no el tope de convocatoria). */
  field_unit_count: number;
  /** 8 / 16 / 32 / 64 según el campo. */
  bracket_size: number;
};

export type MatchPlayTeamsPageData = {
  rules: MatchPlayRulesSnapshot | null;
  categories: Array<{
    id: string;
    code: string | null;
    name: string | null;
    handicap_min: number | null;
    handicap_max: number | null;
  }>;
  entries: MatchPlayEntryRow[];
  teams: MatchPlayTeamRow[];
  assignedEntryIds: Set<string>;
  migrationMissing: boolean;
};
