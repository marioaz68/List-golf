-- Topes individuales de HI por género para parejas match play.

ALTER TABLE tournament_matchplay_rules
  ADD COLUMN IF NOT EXISTS male_individual_hi_max numeric(5, 1),
  ADD COLUMN IF NOT EXISTS female_individual_hi_max numeric(5, 1);

COMMENT ON COLUMN tournament_matchplay_rules.male_individual_hi_max IS
  'Tope individual de HI para jugadores hombres en pareja (null = sin tope).';
COMMENT ON COLUMN tournament_matchplay_rules.female_individual_hi_max IS
  'Tope individual de HI para jugadoras mujeres en pareja (null = sin tope).';
