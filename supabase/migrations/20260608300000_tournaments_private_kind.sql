-- ============================================================
-- Rondas del día / casuales: privacidad + tipo de torneo.
--
-- Permite que el club lleve registro diario de rondas de socios SIN
-- exponerlas en la página pública (/torneos, /torneos/[id], etc.).
--
-- Reglas:
--   - is_private=true   → NO aparece en página pública (filtrar todas
--                         las queries que sirven a no-staff).
--                       → SÍ aparece en Mini App del socio (su historial)
--                         y en backoffice (panel del comité).
--   - kind='competition' (default) → torneo formal como hoy.
--     kind='daily_round'           → ronda del día del club (privada por default).
--     kind='practice'              → ronda de práctica suelta.
--
-- Ambas columnas son SAFE para datos existentes:
--   - is_private default false   → todo torneo viejo sigue siendo público
--   - kind default 'competition' → todo torneo viejo sigue como competición
-- ============================================================

ALTER TABLE public.tournaments
  ADD COLUMN IF NOT EXISTS is_private boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'competition';

COMMENT ON COLUMN public.tournaments.is_private IS
  'Si true, el torneo NO aparece en página pública /torneos. Sigue visible en backoffice y Mini App del socio.';
COMMENT ON COLUMN public.tournaments.kind IS
  'competition | daily_round | practice — determina filtros, reportes y vista de listas.';

-- Constraint del enum de kind (NOT VALID por si hay datos legacy)
ALTER TABLE public.tournaments DROP CONSTRAINT IF EXISTS tournaments_kind_check;
ALTER TABLE public.tournaments ADD CONSTRAINT tournaments_kind_check
  CHECK (kind IN ('competition', 'daily_round', 'practice')) NOT VALID;

-- Índices para listados:
-- Backoffice de "rondas diarias" (kind='daily_round') ordenadas por fecha.
CREATE INDEX IF NOT EXISTS idx_tournaments_daily_round
  ON public.tournaments (start_date DESC NULLS LAST)
  WHERE kind = 'daily_round';

-- Listado público — filtra is_private=false. Útil para queries a /torneos.
CREATE INDEX IF NOT EXISTS idx_tournaments_public_listing
  ON public.tournaments (start_date DESC NULLS LAST)
  WHERE is_private = false;
