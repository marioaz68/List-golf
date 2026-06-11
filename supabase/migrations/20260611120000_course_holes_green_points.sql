-- Coordenadas calibradas de entrada / centro / atrás del green por hoyo.

ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS green_front_lat double precision NULL,
  ADD COLUMN IF NOT EXISTS green_front_lon double precision NULL,
  ADD COLUMN IF NOT EXISTS green_center_lat double precision NULL,
  ADD COLUMN IF NOT EXISTS green_center_lon double precision NULL,
  ADD COLUMN IF NOT EXISTS green_back_lat double precision NULL,
  ADD COLUMN IF NOT EXISTS green_back_lon double precision NULL;

COMMENT ON COLUMN public.course_holes.green_front_lat IS
  'Entrada del green (frente). Si NULL, se calcula del polígono del hoyo.';
COMMENT ON COLUMN public.course_holes.green_center_lat IS
  'Centro del green. Si NULL, se usa el centro del PDF/polígono.';
COMMENT ON COLUMN public.course_holes.green_back_lat IS
  'Fondo del green (atrás). Si NULL, se calcula del polígono del hoyo.';
