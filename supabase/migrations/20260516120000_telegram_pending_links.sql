-- Contactos que escribieron al bot sin estar vinculados (para pegar ID en KIT)
CREATE TABLE IF NOT EXISTS public.telegram_pending_links (
  telegram_user_id text PRIMARY KEY,
  telegram_chat_id text,
  first_name text,
  last_name text,
  username text,
  last_message text,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS telegram_pending_links_last_seen_idx
  ON public.telegram_pending_links (last_seen_at DESC);

COMMENT ON TABLE public.telegram_pending_links IS
  'Últimos usuarios de Telegram que escribieron al bot sin telegram_user_id en players';
