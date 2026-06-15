-- Permite guardar la "línea central de fairway" (centerline) por hoyo:
-- una secuencia ordenada de puntos (LineString) salida→green que Yardas usa
-- para detectar el hoyo y orientar la foto siguiendo el fairway (doglegs).

ALTER TABLE public.course_hole_polygons
  DROP CONSTRAINT IF EXISTS course_hole_polygons_kind_check;

ALTER TABLE public.course_hole_polygons
  ADD CONSTRAINT course_hole_polygons_kind_check
  CHECK (kind IN ('fairway', 'green', 'bunker', 'water', 'ob', 'centerline'));
