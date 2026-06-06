-- Tabla para códigos one-time que validan la app nativa de List.Golf.
-- El caddie/jugador escribe `/codigo` al bot @ListGolfBot, el bot genera un
-- código de 6 dígitos válido 10 min y lo guarda aquí asociado a su
-- caddie_id o players.id. Al validarlo desde la app, se borra (one-time).
--
-- Sin RLS público — solo el bot (service role) inserta y la API
-- /api/mobile/auth/redeem (también service role) lo consume.

CREATE TABLE IF NOT EXISTS public.mobile_auth_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  caddie_id uuid NULL REFERENCES public.caddies (id) ON DELETE CASCADE,
  player_id uuid NULL REFERENCES public.players (id) ON DELETE CASCADE,
  entry_id uuid NULL REFERENCES public.tournament_entries (id) ON DELETE SET NULL,
  display_name text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  -- Al menos uno de los dos identificadores debe estar lleno.
  CONSTRAINT mobile_auth_codes_has_subject CHECK (
    caddie_id IS NOT NULL OR player_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS mobile_auth_codes_active_code_idx
  ON public.mobile_auth_codes (code)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS mobile_auth_codes_expires_idx
  ON public.mobile_auth_codes (expires_at)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS mobile_auth_codes_caddie_idx
  ON public.mobile_auth_codes (caddie_id)
  WHERE caddie_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS mobile_auth_codes_player_idx
  ON public.mobile_auth_codes (player_id)
  WHERE player_id IS NOT NULL;

ALTER TABLE public.mobile_auth_codes ENABLE ROW LEVEL SECURITY;
-- Sin policies = nadie puede leerla excepto service_role (que bypassa RLS).

COMMENT ON TABLE public.mobile_auth_codes IS
  'Códigos one-time generados por el bot de Telegram para autenticar la app nativa List.Golf en Android. Expiran a los 10 min y se borran al consumir.';
