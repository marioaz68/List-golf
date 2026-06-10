-- ============================================================================
-- Clientes del fraccionamiento (reparto a domicilio)
--
-- Un cliente del fraccionamiento NO necesita inscripción a torneo: basta con
-- estar conectado al sistema por Telegram (players.telegram_user_id). En su
-- visita al restaurante se le da de alta su domicilio y teléfonos de contacto.
--
-- Reusamos la tabla players (entidad "persona" con vínculo a Telegram) y le
-- agregamos:
--   • address      → domicilio dentro del fraccionamiento (para reparto)
--   • is_resident  → marca de cliente del fraccionamiento (aparece en la
--                    pantalla "Fraccionamiento" del backoffice)
-- ============================================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS address text NULL;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS is_resident boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS players_resident_idx
  ON public.players (is_resident)
  WHERE is_resident = true;

COMMENT ON COLUMN public.players.address IS
  'Domicilio dentro del fraccionamiento para reparto a domicilio (F&B).';
COMMENT ON COLUMN public.players.is_resident IS
  'Cliente del fraccionamiento (reparto a domicilio). Aparece en la pantalla Fraccionamiento.';
