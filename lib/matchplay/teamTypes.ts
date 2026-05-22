export type MatchPlayEntryPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  gender: "M" | "F" | "X" | null;
  handicap_index: number | null;
};

export type MatchPlayEntryRow = {
  id: string;
  player_id: string;
  player_number: number | null;
  handicap_index: number | null;
  status: string | null;
  effective_hi: number;
  player: MatchPlayEntryPlayer;
  category_id: string | null;
  category_code: string | null;
  category_name: string | null;
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
};

export type MatchPlayTeamsPageData = {
  rules: MatchPlayRulesSnapshot | null;
  categories: Array<{ id: string; code: string | null; name: string | null }>;
  entries: MatchPlayEntryRow[];
  teams: MatchPlayTeamRow[];
  assignedEntryIds: Set<string>;
  migrationMissing: boolean;
};
