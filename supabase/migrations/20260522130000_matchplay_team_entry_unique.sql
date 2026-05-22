-- Un inscrito solo puede pertenecer a un equipo activo por torneo.

CREATE UNIQUE INDEX IF NOT EXISTS uq_matchplay_team_entry_a
  ON matchplay_pair_teams (tournament_id, player_a_entry_id)
  WHERE player_a_entry_id IS NOT NULL AND is_active = true;

CREATE UNIQUE INDEX IF NOT EXISTS uq_matchplay_team_entry_b
  ON matchplay_pair_teams (tournament_id, player_b_entry_id)
  WHERE player_b_entry_id IS NOT NULL AND is_active = true;
