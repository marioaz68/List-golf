-- Polígonos calibrados por hoyo: fairway, green, bunkers, agua y out of bounds.
-- Se dibujan con clic en el mapa satelital (como la línea azul del hoyo) y el
-- sistema los usa para clasificar dónde cayó cada tiro (point-in-polygon) y así
-- sacar estadísticas (fairways acertados, greens en regulación, etc.).

CREATE TABLE IF NOT EXISTS public.course_hole_polygons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  kind text NOT NULL
    CHECK (kind IN ('fairway', 'green', 'bunker', 'water', 'ob')),
  -- Geometría GeoJSON (tipo Polygon) del elemento.
  geojson jsonb NOT NULL,
  -- Permite varios del mismo tipo por hoyo (p. ej. 3 bunkers => 0,1,2).
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_hole_polygons_course_hole
  ON public.course_hole_polygons (course_id, hole_number, kind, sort_order);

-- Un solo polígono por (campo, hoyo, tipo, índice): facilita el upsert.
CREATE UNIQUE INDEX IF NOT EXISTS uq_course_hole_polygons_slot
  ON public.course_hole_polygons (course_id, hole_number, kind, sort_order);

COMMENT ON TABLE public.course_hole_polygons IS
  'Polígonos calibrados por hoyo (fairway, green, bunker, agua, OB) dibujados en el satélite.';

ALTER TABLE public.course_hole_polygons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_hole_polygons_select_authenticated"
  ON public.course_hole_polygons FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "course_hole_polygons_write_authenticated"
  ON public.course_hole_polygons FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
