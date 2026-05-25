-- WHS / GHIN handicap automático para match play.
--
-- Orden oficial WHS:
--   Course Handicap  CH = round( HI × Slope / 113 + (CR − Par) )
--   Playing Handicap PH = round( CH × Allowance% / 100 )
--
-- Para match play se aplica al inscrito por sexo. Para Bola Baja + Bola Alta
-- (clubes mexicanos) el allowance suele ser 80%, para individual 100%.
-- Las consolaciones reutilizan el mismo PH almacenado en tournament_entries.

ALTER TABLE public.tournament_matchplay_rules
  ADD COLUMN IF NOT EXISTS whs_slope_men smallint
    CHECK (whs_slope_men IS NULL OR (whs_slope_men BETWEEN 55 AND 155)),
  ADD COLUMN IF NOT EXISTS whs_slope_women smallint
    CHECK (whs_slope_women IS NULL OR (whs_slope_women BETWEEN 55 AND 155)),
  ADD COLUMN IF NOT EXISTS whs_course_rating_men numeric(5, 1)
    CHECK (whs_course_rating_men IS NULL OR (whs_course_rating_men BETWEEN 50 AND 90)),
  ADD COLUMN IF NOT EXISTS whs_course_rating_women numeric(5, 1)
    CHECK (whs_course_rating_women IS NULL OR (whs_course_rating_women BETWEEN 50 AND 90)),
  ADD COLUMN IF NOT EXISTS whs_par_men smallint
    CHECK (whs_par_men IS NULL OR (whs_par_men BETWEEN 60 AND 80)),
  ADD COLUMN IF NOT EXISTS whs_par_women smallint
    CHECK (whs_par_women IS NULL OR (whs_par_women BETWEEN 60 AND 80));

COMMENT ON COLUMN public.tournament_matchplay_rules.whs_slope_men IS
  'Slope rating de la salida que juegan los caballeros en este torneo (55-155).';
COMMENT ON COLUMN public.tournament_matchplay_rules.whs_slope_women IS
  'Slope rating de la salida que juegan las damas en este torneo (55-155).';
COMMENT ON COLUMN public.tournament_matchplay_rules.whs_course_rating_men IS
  'Course rating de la salida que juegan los caballeros (decimal, ej. 71.4).';
COMMENT ON COLUMN public.tournament_matchplay_rules.whs_course_rating_women IS
  'Course rating de la salida que juegan las damas (decimal, ej. 72.6).';
COMMENT ON COLUMN public.tournament_matchplay_rules.whs_par_men IS
  'Par total de la salida que juegan los caballeros (ej. 72).';
COMMENT ON COLUMN public.tournament_matchplay_rules.whs_par_women IS
  'Par total de la salida que juegan las damas (ej. 72).';

ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS course_handicap smallint,
  ADD COLUMN IF NOT EXISTS playing_handicap smallint,
  ADD COLUMN IF NOT EXISTS playing_handicap_override smallint,
  ADD COLUMN IF NOT EXISTS playing_handicap_override_reason text,
  ADD COLUMN IF NOT EXISTS playing_handicap_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS playing_handicap_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS handicap_calc_meta jsonb;

COMMENT ON COLUMN public.tournament_entries.course_handicap IS
  'Course Handicap calculado (entero): round(HI × Slope/113 + (CR − Par)).';
COMMENT ON COLUMN public.tournament_entries.playing_handicap IS
  'Playing Handicap final efectivo (entero). Es override si existe; si no, round(CH × Allowance%).';
COMMENT ON COLUMN public.tournament_entries.playing_handicap_override IS
  'Override manual del PH. Si NULL se usa el cálculo automático.';
COMMENT ON COLUMN public.tournament_entries.handicap_calc_meta IS
  'Snapshot del cálculo: { hi, slope, course_rating, par, allowance_pct, computed_at }.';

CREATE INDEX IF NOT EXISTS idx_tournament_entries_playing_handicap
  ON public.tournament_entries (tournament_id, playing_handicap);
