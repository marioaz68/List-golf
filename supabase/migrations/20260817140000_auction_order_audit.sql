-- Auditoría del sorteo de subasta: cuándo y quién asignó cada auction_order.
ALTER TABLE matchplay_pair_teams
  ADD COLUMN IF NOT EXISTS auction_order_at timestamptz;

ALTER TABLE matchplay_pair_teams
  ADD COLUMN IF NOT EXISTS auction_order_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN matchplay_pair_teams.auction_order_at IS
  'Momento en que se sorteó este equipo para salir a subasta. Se escribe una sola vez en el sorteo del servidor.';

COMMENT ON COLUMN matchplay_pair_teams.auction_order_by IS
  'Usuario (auth.users) que disparó el sorteo de este equipo.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_matchplay_pair_teams_auction_order_unique
  ON matchplay_pair_teams (tournament_id, auction_order)
  WHERE auction_order IS NOT NULL;
