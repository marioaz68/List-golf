-- OB (out of bounds) de todo el campo: como el campo está dentro de un
-- fraccionamiento, el OB es el mismo borde compartido por muchos hoyos. En vez
-- de re-trazarlo por hoyo, se marca UNA sola vez a nivel de campo usando
-- hole_number = 0 (campo completo) y se muestra en todos los hoyos.
--
-- Esta migración relaja el CHECK de hole_number para permitir 0.

ALTER TABLE public.course_hole_polygons
  DROP CONSTRAINT IF EXISTS course_hole_polygons_hole_number_check;

ALTER TABLE public.course_hole_polygons
  ADD CONSTRAINT course_hole_polygons_hole_number_check
  CHECK (hole_number BETWEEN 0 AND 18);

COMMENT ON COLUMN public.course_hole_polygons.hole_number IS
  'Hoyo 1-18, o 0 para elementos de todo el campo (p. ej. OB del fraccionamiento).';
