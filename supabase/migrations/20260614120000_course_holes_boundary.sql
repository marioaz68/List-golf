-- Polígono calibrado del hoyo (línea azul en mapa). Si NULL, se usa el GeoJSON base.

ALTER TABLE public.course_holes
  ADD COLUMN IF NOT EXISTS boundary_geojson jsonb NULL;

COMMENT ON COLUMN public.course_holes.boundary_geojson IS
  'Polígono GeoJSON del hoyo calibrado en campo. Sobrescribe el polígono base del código.';
