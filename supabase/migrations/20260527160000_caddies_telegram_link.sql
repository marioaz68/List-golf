-- Vinculación del caddie con Telegram para enviar links de captura.
-- La columna `telegram` ya existía como handle (@usuario). Agregamos el ID
-- numérico de Telegram (user_id) y el chat_id, que es lo que necesita la
-- Bot API para enviar mensajes con sendMessage.

ALTER TABLE public.caddies
  ADD COLUMN IF NOT EXISTS telegram_user_id text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

COMMENT ON COLUMN public.caddies.telegram_user_id IS
  'ID numérico del usuario en Telegram (from.id). Se llena cuando el caddie escribe HOLA al bot del torneo.';
COMMENT ON COLUMN public.caddies.telegram_chat_id IS
  'Chat ID con el bot (normalmente igual al user_id en chats privados). Usado para sendMessage.';

CREATE UNIQUE INDEX IF NOT EXISTS caddies_telegram_user_id_unique
  ON public.caddies (telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;
