-- Postura de subasta / calcuta por equipo (define siembra cuando seeding_method = auction).

ALTER TABLE matchplay_pair_teams
  ADD COLUMN IF NOT EXISTS auction_bid numeric(12, 2);

COMMENT ON COLUMN matchplay_pair_teams.auction_bid IS
  'Monto de subasta (MXN). Mayor postura = mejor siembra (seed 1).';
