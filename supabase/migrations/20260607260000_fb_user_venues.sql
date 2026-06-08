-- ============================================================================
-- Asociación usuario → venues F&B (multi-tenant interno).
--
-- Cada usuario con rol 'restaurante' se asigna a uno o varios venues
-- (carritos / restaurante). Solo ve pedidos y cuentas de esos venues.
--
-- is_owner=true → el usuario ve TODO sin filtro de venue (dueño/manager
-- del negocio). También accede a /fb-reportes con totales del día.
--
-- Si no hay filas para un usuario:
--   - super_admin / club_admin / tournament_director → ven todo
--     (acceso heredado al modulo fb)
--   - restaurante sin asignaciones → no ve nada (defensa por defecto)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fb_user_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.fb_venues (id) ON DELETE CASCADE,
  is_owner boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fb_user_venues_user_venue_uniq
  ON public.fb_user_venues (user_id, venue_id);

CREATE INDEX IF NOT EXISTS fb_user_venues_user_idx
  ON public.fb_user_venues (user_id);

CREATE INDEX IF NOT EXISTS fb_user_venues_owner_idx
  ON public.fb_user_venues (user_id)
  WHERE is_owner = true;

ALTER TABLE public.fb_user_venues ENABLE ROW LEVEL SECURITY;
-- Sin policies = solo service_role lee/escribe (backoffice usa admin client).

COMMENT ON TABLE public.fb_user_venues IS
  'Asociación de usuarios con venues F&B. Operadores ven solo sus venues; is_owner=true ve todo + reportes.';
