-- WHS data por tee del campo (slope, course rating, par, yardaje).
-- En el WHS oficial una misma salida puede tener distinto rating para
-- caballeros y damas (ej. Blancas CCQ: M=70.7/127, F=77.2/152), por eso
-- guardamos dos pares de columnas.

ALTER TABLE public.course_tee_sets
  ADD COLUMN IF NOT EXISTS gender_default text
    CHECK (gender_default IS NULL OR gender_default IN ('M','F','X')),
  ADD COLUMN IF NOT EXISTS slope_men smallint
    CHECK (slope_men IS NULL OR (slope_men BETWEEN 55 AND 155)),
  ADD COLUMN IF NOT EXISTS slope_women smallint
    CHECK (slope_women IS NULL OR (slope_women BETWEEN 55 AND 155)),
  ADD COLUMN IF NOT EXISTS course_rating_men numeric(5,1)
    CHECK (course_rating_men IS NULL OR (course_rating_men BETWEEN 50 AND 90)),
  ADD COLUMN IF NOT EXISTS course_rating_women numeric(5,1)
    CHECK (course_rating_women IS NULL OR (course_rating_women BETWEEN 50 AND 90)),
  ADD COLUMN IF NOT EXISTS par smallint
    CHECK (par IS NULL OR (par BETWEEN 60 AND 80)),
  ADD COLUMN IF NOT EXISTS yardage integer
    CHECK (yardage IS NULL OR (yardage BETWEEN 3000 AND 8500));

COMMENT ON COLUMN public.course_tee_sets.gender_default IS
  'Género que normalmente juega esta salida: M, F, o X (mixto / cualquiera).';
COMMENT ON COLUMN public.course_tee_sets.slope_men IS
  'Slope rating oficial para caballeros (55-155).';
COMMENT ON COLUMN public.course_tee_sets.slope_women IS
  'Slope rating oficial para damas (55-155).';
COMMENT ON COLUMN public.course_tee_sets.course_rating_men IS
  'Course Rating oficial para caballeros (decimal, ej. 73.2).';
COMMENT ON COLUMN public.course_tee_sets.course_rating_women IS
  'Course Rating oficial para damas (decimal, ej. 77.2).';

-- Carga inicial de CCQ (Club Campestre de Querétaro).
-- Idempotente: UPDATE por id, INSERT con ON CONFLICT.

UPDATE public.course_tee_sets
SET gender_default='M', slope_men=138, course_rating_men=73.2, par=72, yardage=7066
WHERE id='9eb0f116-7ac3-4f4f-a233-57a594f9cd0c';

UPDATE public.course_tee_sets
SET gender_default='M', slope_men=136, course_rating_men=72.7, par=72, yardage=6908
WHERE id='4317191f-9eeb-418c-9142-c63b24fa77ce';

UPDATE public.course_tee_sets
SET gender_default='X',
    slope_men=127, course_rating_men=70.7,
    slope_women=152, course_rating_women=77.2,
    par=72, yardage=6463
WHERE id='63a8d414-36f6-45a2-933f-fdfb372c891e';

UPDATE public.course_tee_sets
SET gender_default='M', slope_men=125, course_rating_men=67.0, par=72, yardage=5834
WHERE id='dedbaae4-4142-466c-a57f-2e42324b6cc3';

UPDATE public.course_tee_sets
SET gender_default='F', slope_women=136, course_rating_women=71.5, par=72, yardage=5615
WHERE id='5c737df8-b074-4ade-ae63-c3a7d65dc4de';

INSERT INTO public.course_tee_sets
  (course_id, code, name, color, sort_order,
   gender_default, slope_men, course_rating_men, par, yardage)
VALUES
  ('4bd3a144-dfe4-49f0-b11c-1d80132a7e63', 'GRY', 'Grises (CIJ)', 'gray', 6,
   'X', 141, 74.5, 72, 6154)
ON CONFLICT DO NOTHING;
