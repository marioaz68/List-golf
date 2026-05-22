-- Captura Bola Baja + Bola Alta: scores por jugador y puntos por hoyo.

ALTER TABLE matchplay_hole_results
  ADD COLUMN IF NOT EXISTS scoring_format text,
  ADD COLUMN IF NOT EXISTS top_points numeric(4, 1),
  ADD COLUMN IF NOT EXISTS bottom_points numeric(4, 1),
  ADD COLUMN IF NOT EXISTS top_player_a_strokes smallint,
  ADD COLUMN IF NOT EXISTS top_player_b_strokes smallint,
  ADD COLUMN IF NOT EXISTS bottom_player_a_strokes smallint,
  ADD COLUMN IF NOT EXISTS bottom_player_b_strokes smallint,
  ADD COLUMN IF NOT EXISTS detail_json jsonb;

COMMENT ON COLUMN matchplay_hole_results.scoring_format IS
  'low_high = 2 pts/hoyo (baja vs baja + alta vs alta); null = legacy top/bottom strokes.';
