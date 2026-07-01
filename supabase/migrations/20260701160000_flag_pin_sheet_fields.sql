-- Captura de bandera por "pin sheet" (yardas), más exacta que el GPS:
--   color: roja=adelante / blanca=medio / azul=atrás (zona del green)
--   side:  left/right (lado respecto al centro)
--   depth_yards: yardas en línea recta desde la orilla de referencia
--                (frente si roja/blanca, atrás si azul) hasta la bandera
--   edge_yards:  yardas de la bandera a la orilla del green del lado elegido
-- Con la circunferencia calibrada del green se convierte a lat/lon.

ALTER TABLE public.course_hole_flag_positions
  ADD COLUMN IF NOT EXISTS color text NULL,
  ADD COLUMN IF NOT EXISTS side text NULL,
  ADD COLUMN IF NOT EXISTS depth_yards double precision NULL,
  ADD COLUMN IF NOT EXISTS edge_yards double precision NULL;

-- Permitir el nuevo origen 'yards' (captura por pin sheet) además de gps/map.
ALTER TABLE public.course_hole_flag_positions
  DROP CONSTRAINT IF EXISTS course_hole_flag_positions_source_check;
ALTER TABLE public.course_hole_flag_positions
  ADD CONSTRAINT course_hole_flag_positions_source_check
  CHECK (source IN ('gps', 'map', 'yards'));

COMMENT ON COLUMN public.course_hole_flag_positions.color IS
  'Zona/color de la bandera: roja=adelante, blanca=medio, azul=atrás.';
COMMENT ON COLUMN public.course_hole_flag_positions.depth_yards IS
  'Yardas desde la orilla de referencia (frente si roja/blanca, atrás si azul) a la bandera.';
COMMENT ON COLUMN public.course_hole_flag_positions.edge_yards IS
  'Yardas de la bandera a la orilla del green del lado (side) elegido.';
