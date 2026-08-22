-- Tokens one-time para vincular jugadores/caddies vía t.me/<BOT>?start=<token>
-- + columnas de chat inválido (chat not found / bot blocked).

-- Caddies: asegurar telegram_user_id (migración previa pudo no aplicarse en prod).
ALTER TABLE public.caddies
  ADD COLUMN IF NOT EXISTS telegram_user_id text;

COMMENT ON COLUMN public.caddies.telegram_user_id IS
  'Telegram user id numérico (mismo que mensaje.from.id). Preferido sobre la columna legacy telegram.';

CREATE UNIQUE INDEX IF NOT EXISTS caddies_telegram_user_id_unique
  ON public.caddies (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;

-- Backfill desde legacy `telegram` solo cuando el valor es único (evita
-- violar el índice unique si dos filas comparten el mismo ID legacy).
UPDATE public.caddies c
SET telegram_user_id = trim(c.telegram)
WHERE c.telegram_user_id IS NULL
  AND c.telegram IS NOT NULL
  AND trim(c.telegram) ~ '^[0-9]+$'
  AND (
    SELECT count(*)::int
    FROM public.caddies x
    WHERE x.telegram IS NOT NULL
      AND trim(x.telegram) = trim(c.telegram)
  ) = 1;

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS telegram_chat_invalid_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_chat_invalid_reason text;

ALTER TABLE public.caddies
  ADD COLUMN IF NOT EXISTS telegram_chat_invalid_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_chat_invalid_reason text;

COMMENT ON COLUMN public.players.telegram_chat_invalid_at IS
  'Última vez que Telegram rechazó envío a este chat (chat not found / bot blocked). NULL = chat usable.';
COMMENT ON COLUMN public.players.telegram_chat_invalid_reason IS
  'Motivo del último fallo de envío (p. ej. chat_not_found, bot_blocked).';
COMMENT ON COLUMN public.caddies.telegram_chat_invalid_at IS
  'Última vez que Telegram rechazó envío a este chat. NULL = chat usable.';
COMMENT ON COLUMN public.caddies.telegram_chat_invalid_reason IS
  'Motivo del último fallo de envío.';

CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  player_id uuid NULL REFERENCES public.players (id) ON DELETE CASCADE,
  caddie_id uuid NULL REFERENCES public.caddies (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NULL,
  created_by uuid NULL,
  CONSTRAINT telegram_link_tokens_has_subject CHECK (
    (player_id IS NOT NULL AND caddie_id IS NULL)
    OR (player_id IS NULL AND caddie_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS telegram_link_tokens_active_token_idx
  ON public.telegram_link_tokens (token)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS telegram_link_tokens_player_idx
  ON public.telegram_link_tokens (player_id)
  WHERE player_id IS NOT NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS telegram_link_tokens_caddie_idx
  ON public.telegram_link_tokens (caddie_id)
  WHERE caddie_id IS NOT NULL AND consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS telegram_link_tokens_expires_idx
  ON public.telegram_link_tokens (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo service_role (bypass RLS).

COMMENT ON TABLE public.telegram_link_tokens IS
  'Tokens one-time para deep link t.me/BOT?start=TOKEN. Al abrir /start el bot guarda chat_id real y consume el token.';
