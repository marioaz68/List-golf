-- Pings desde app móvil / captura web no traen telegram_user_id; se identifican
-- por player_id. Telegram Live Location sigue llenando ambos campos.

ALTER TABLE public.ritmo_positions
  ALTER COLUMN telegram_user_id DROP NOT NULL;

COMMENT ON COLUMN public.ritmo_positions.telegram_user_id IS
  'ID numérico de Telegram si el ping vino del bot; null si vino de app móvil o mini app web.';
