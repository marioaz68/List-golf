-- Aceptación del jugador de la distancia (link/token desde su teléfono).
-- La firma del capturista ya está en signature_payload / signed_at / signer_name.

ALTER TABLE public.closest_to_pin_entries
  ADD COLUMN IF NOT EXISTS accept_token text NULL,
  ADD COLUMN IF NOT EXISTS accept_token_expires_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS player_accepted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS player_signature_payload text NULL,
  ADD COLUMN IF NOT EXISTS player_signer_name text NULL;

-- Un token por captura (cuando existe).
CREATE UNIQUE INDEX IF NOT EXISTS closest_to_pin_accept_token_uidx
  ON public.closest_to_pin_entries (accept_token)
  WHERE accept_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS closest_to_pin_accept_token_lookup
  ON public.closest_to_pin_entries (accept_token)
  WHERE accept_token IS NOT NULL;

COMMENT ON COLUMN public.closest_to_pin_entries.accept_token IS
  'Token público para que el jugador acepte la distancia en su teléfono (/aceptar-cerca/[token]).';
COMMENT ON COLUMN public.closest_to_pin_entries.player_accepted_at IS
  'Cuando el jugador aceptó la distancia desde su link.';
