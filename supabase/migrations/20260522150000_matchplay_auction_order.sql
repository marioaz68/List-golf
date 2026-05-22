-- Orden de salida a la subasta (desempate cuando dos equipos comparten postura).
ALTER TABLE matchplay_pair_teams
  ADD COLUMN IF NOT EXISTS auction_order integer;

COMMENT ON COLUMN matchplay_pair_teams.auction_order IS
  'Orden secuencial en que el equipo salió a la subasta. Si dos equipos empatan en auction_bid, gana mejor seed el de menor auction_order (salió primero).';

CREATE INDEX IF NOT EXISTS idx_matchplay_pair_teams_auction_order
  ON matchplay_pair_teams (tournament_id, auction_order);
