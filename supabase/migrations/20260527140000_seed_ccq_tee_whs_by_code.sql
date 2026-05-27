-- Carga WHS del Club Campestre de Querétaro por course_id + code (idempotente).
-- Valores del tablero oficial: Rating / Slope por salida.

DO $$
DECLARE
  v_course_id uuid := '4bd3a144-dfe4-49f0-b11c-1d80132a7e63';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = v_course_id) THEN
    RAISE NOTICE 'CCQ course not found, skipping WHS seed';
    RETURN;
  END IF;

  UPDATE public.course_tee_sets
  SET gender_default = 'M', course_rating_men = 73.2, slope_men = 138, par = 72
  WHERE course_id = v_course_id AND upper(code) IN ('BLK', 'NEGRAS');

  UPDATE public.course_tee_sets
  SET gender_default = 'M', course_rating_men = 72.7, slope_men = 136, par = 72
  WHERE course_id = v_course_id AND upper(code) IN ('BLU', 'AZUL', 'AZULES');

  UPDATE public.course_tee_sets
  SET gender_default = 'X',
      course_rating_men = 70.7, slope_men = 127,
      course_rating_women = 77.2, slope_women = 152,
      par = 72
  WHERE course_id = v_course_id AND upper(code) IN ('WHT', 'BLANCAS');

  UPDATE public.course_tee_sets
  SET gender_default = 'M', course_rating_men = 67.0, slope_men = 125, par = 72
  WHERE course_id = v_course_id AND upper(code) IN ('GLD', 'DORADAS', 'GOLD');

  UPDATE public.course_tee_sets
  SET gender_default = 'F', course_rating_women = 71.5, slope_women = 136, par = 72
  WHERE course_id = v_course_id AND upper(code) IN ('RED', 'ROJAS');

  -- Blancas damas (mismo rating/slope que blancas en tablero CCQ)
  UPDATE public.course_tee_sets
  SET gender_default = 'F', course_rating_women = 70.7, slope_women = 127, par = 72
  WHERE course_id = v_course_id
    AND (
      upper(code) IN ('WHTF', 'WHT-F', 'BLD', 'BLANCAS-DAMAS')
      OR upper(name) LIKE '%DAMAS%'
    );
END $$;
