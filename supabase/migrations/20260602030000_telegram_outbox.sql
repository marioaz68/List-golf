-- Telegram outbox: rastrea cada mensaje del bot enviado a un chat_id en
-- un torneo concreto. Al notificar la siguiente ronda, borramos el
-- mensaje previo del mismo torneo+chat+kind para no acumular avisos.
--
-- Notas:
--  • chat_id es text (Telegram usa enteros muy grandes que conviene
--    almacenar como string).
--  • message_id es bigint (id numérico de Telegram).
--  • kind permite distinguir tipos de notificación (próxima ronda,
--    invitación a captura, recordatorio, etc.). El borrado solo opera
--    sobre el mismo kind.

CREATE TABLE IF NOT EXISTS public.telegram_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  message_id bigint NOT NULL,
  round_id uuid REFERENCES public.rounds(id) ON DELETE SET NULL,
  group_id uuid REFERENCES public.pairing_groups(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'next_round_group',
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_telegram_outbox_lookup
  ON public.telegram_outbox (tournament_id, chat_id, kind);

CREATE INDEX IF NOT EXISTS idx_telegram_outbox_round
  ON public.telegram_outbox (round_id);

COMMENT ON TABLE public.telegram_outbox IS
  'Mensajes enviados por el bot de Telegram. Se usa para borrar el mensaje previo del mismo torneo+chat+kind cuando avanza el torneo.';
