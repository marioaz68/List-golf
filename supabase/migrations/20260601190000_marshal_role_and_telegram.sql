-- Marshal / juez de campo: nuevo rol con acceso limitado a captura y
-- revisión de tarjetas. Pensado para 5 usuarios fijos por club que
-- entran cuando caddies o jugadores no están capturando.
--
-- También agregamos los campos de Telegram en profiles para que los
-- marshals (y en el futuro cualquier admin operativo) puedan recibir
-- notificaciones del bot y/o capturar directamente desde Telegram.

-- 1) Insertar rol marshal si no existe.
INSERT INTO public.roles (code, name, description)
VALUES (
  'marshal',
  'Marshal / Juez de campo',
  'Ayuda a capturar tarjetas y revisarlas cuando caddies o jugadores no lo hacen. Acceso solo a captura y scorecards.'
)
ON CONFLICT (code) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

-- 2) Telegram en profiles.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_username text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text;

COMMENT ON COLUMN public.profiles.telegram_username IS
  'Handle de Telegram (sin @). Lo escribe el director al dar de alta al usuario; sirve de referencia para que el marshal sepa con qué cuenta hacer /start.';

COMMENT ON COLUMN public.profiles.telegram_chat_id IS
  'Chat ID numérico de Telegram. Lo llena automáticamente el bot la primera vez que el usuario haga /start <token>. Se usa para enviarle notificaciones y permitirle capturar vía Telegram.';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_chat_id_uniq
  ON public.profiles (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL;
