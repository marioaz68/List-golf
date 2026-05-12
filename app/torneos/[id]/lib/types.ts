export type Tournament = {
  id: string;
  name: string | null;
  start_date: string | null;
  is_public: boolean | null;
};

export type ClubRef = {
  name: string | null;
  short_name: string | null;
};

export type EntryPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  club: string | null;
  club_id: string | null;
  clubs: ClubRef | ClubRef[] | null;
};

export type EntryCategory = {
  id: string;
  code: string | null;
  name: string | null;
};

export type TournamentEntryJoinRow = {
  id: string;
  player_id: string;
  category_id: string | null;
  status: string | null;
  player: EntryPlayer | EntryPlayer[] | null;
  category: EntryCategory | EntryCategory[] | null;
};

export type ValidTournamentEntry = {
  id: string;
  player_id: string;
  category_id: string | null;
  status: string | null;
  player: EntryPlayer;
  category: EntryCategory | null;
};

export type RoundRow = {
  id: string;
  round_no: number;
  round_date: string | null;
  category_id?: string | null;
  notes: string | null;
  start_type: string | null;
  start_time: string | null;
  wave?: string | null;
};

export type RoundScoreRow = {
  id: string;
  round_id: string;
  player_id: string;
  gross_score: number | null;
};

export type HoleScoreRow = {
  round_score_id: string;
  hole_number: number;
  strokes: number | null;
};

export type TournamentHoleRow = {
  hole_number: number | null;
  par: number | null;
};

export type HoleDetail = {
  hole_number: number;
  par: number | null;
  strokes: number | null;
};

export type RoundDetail = {
  round_id: string;
  round_no: number;
  round_date: string | null;
  /** Alineado con `rounds.category_id` en BD; filtra el detalle hoyo por hoyo por categoría. */
  category_id?: string | null;
  gross_score: number | null;
  to_par: number | null;
  out_score: number | null;
  in_score: number | null;
  total_score: number | null;
  holes: HoleDetail[];
  is_dq: boolean;
};

export type RoundStandingSnapshot = {
  round_id: string;
  round_no: number;
  pos: number | null;
  to_par: number | null;
  gross: number | null;
  played_rounds: number;
};

export type PairingMember = {
  entry_id: string;
  position: number;
  player_name: string;
  club_id: string | null;
  club_label: string | null;
  category_code: string | null;
  handicap_index: number | null;
};

export type PublicPairingGroup = {
  id: string;
  round_id: string;
  round_no: number;
  round_date: string | null;
  group_no: number;
  tee_time: string | null;
  starting_hole: number | null;
  /** H1A / H10B en shotgun; en tee time suele ser Hn según `starting_hole`. */
  starting_hole_label: string | null;
  notes: string | null;
  members: PairingMember[];
};

export type LeaderboardRow = {
  entry_id: string;
  player_id: string;
  player_name: string;
  player_code: string;
  club_id: string | null;
  club_label: string | null;
  category_id: string | null;
  category_code: string | null;
  entry_status: string | null;
  is_disqualified: boolean;
  total_to_par: number | null;
  selected_round_to_par: number | null;
  total_gross: number | null;
  selected_round_position: number | null;
  previous_round_position: number | null;
  move_vs_previous: number | null;
  selected_round_position_category: number | null;
  previous_round_position_category: number | null;
  move_vs_previous_category: number | null;
  rounds: Array<{
    round_id: string;
    round_no: number;
    gross_score: number | null;
    is_dq: boolean;
  }>;
  details: RoundDetail[];
  standing_by_round: RoundStandingSnapshot[];
  standing_by_round_category: RoundStandingSnapshot[];
  hasScores: boolean;
};