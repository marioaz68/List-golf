-- Match Play: tablas adicionales (no modifican stroke/stableford existente).

CREATE TABLE IF NOT EXISTS tournament_matchplay_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  match_type text NOT NULL DEFAULT 'pairs' CHECK (match_type IN ('individual', 'pairs')),
  pair_format text NOT NULL DEFAULT 'fourball',
  bracket_type text NOT NULL DEFAULT 'single_elim',
  category_basis text NOT NULL DEFAULT 'combined_hi',
  pair_composition text NOT NULL DEFAULT 'open',
  combined_hi_min numeric(5, 1),
  combined_hi_max numeric(5, 1),
  handicap_allowance text NOT NULL DEFAULT 'fourball_85',
  handicap_allowance_pct numeric(5, 2),
  match_tiebreaker text NOT NULL DEFAULT 'sudden_death',
  holes_per_match smallint NOT NULL DEFAULT 18,
  bracket_round_count smallint NOT NULL DEFAULT 4,
  bracket_main_pairs integer,
  play_in_enabled boolean NOT NULL DEFAULT false,
  max_pairs_per_category integer,
  seeding_method text NOT NULL DEFAULT 'hi_combined',
  auction_enabled boolean NOT NULL DEFAULT false,
  auction_pot_percent numeric(5, 2),
  auction_min_bid numeric(12, 2),
  auction_max_bid numeric(12, 2),
  auction_currency text DEFAULT 'MXN',
  notes text,
  rules_text text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_matchplay_rules_tournament
  ON tournament_matchplay_rules (tournament_id);

COMMENT ON TABLE tournament_matchplay_rules IS
  'Reglas de competencia match play aplicadas desde convocatoria (torneos format_type=matchplay).';

-- Parejas inscritas (Fase 1+)
CREATE TABLE IF NOT EXISTS matchplay_pair_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  player_a_entry_id uuid REFERENCES tournament_entries(id) ON DELETE SET NULL,
  player_b_entry_id uuid REFERENCES tournament_entries(id) ON DELETE SET NULL,
  team_name text,
  combined_hi numeric(5, 1),
  seed integer,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matchplay_pair_teams_tournament
  ON matchplay_pair_teams (tournament_id);

-- Cuadro / bracket por categoría (Fase 2+)
CREATE TABLE IF NOT EXISTS matchplay_brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Principal',
  bracket_type text NOT NULL DEFAULT 'single_elim',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'completed')),
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_matchplay_brackets_tournament
  ON matchplay_brackets (tournament_id);

-- Partidos entre parejas (Fase 2–3+)
CREATE TABLE IF NOT EXISTS matchplay_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  bracket_id uuid NOT NULL REFERENCES matchplay_brackets(id) ON DELETE CASCADE,
  round_no smallint NOT NULL,
  position_no smallint NOT NULL,
  top_pair_id uuid REFERENCES matchplay_pair_teams(id) ON DELETE SET NULL,
  bottom_pair_id uuid REFERENCES matchplay_pair_teams(id) ON DELETE SET NULL,
  winner_pair_id uuid REFERENCES matchplay_pair_teams(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'in_progress', 'completed', 'bye', 'walkover')
  ),
  result_text text,
  holes_played smallint,
  next_match_id uuid REFERENCES matchplay_matches(id) ON DELETE SET NULL,
  scheduled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bracket_id, round_no, position_no)
);

CREATE INDEX IF NOT EXISTS idx_matchplay_matches_bracket_round
  ON matchplay_matches (bracket_id, round_no);

-- Resultado hoyo a hoyo (Fase 3+)
CREATE TABLE IF NOT EXISTS matchplay_hole_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES matchplay_matches(id) ON DELETE CASCADE,
  hole_no smallint NOT NULL,
  top_strokes integer,
  bottom_strokes integer,
  hole_winner text CHECK (hole_winner IN ('top', 'bottom', 'halved', NULL)),
  match_status_after text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, hole_no)
);

CREATE INDEX IF NOT EXISTS idx_matchplay_hole_results_match
  ON matchplay_hole_results (match_id);
