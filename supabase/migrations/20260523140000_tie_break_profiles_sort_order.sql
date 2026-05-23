-- Prod creó tie_break_profiles sin sort_order (CREATE TABLE IF NOT EXISTS no altera tablas existentes).
ALTER TABLE public.tie_break_profiles
  ADD COLUMN IF NOT EXISTS sort_order integer;

COMMENT ON COLUMN public.tie_break_profiles.sort_order IS
  'Orden de visualización / prioridad entre perfiles del mismo torneo.';
