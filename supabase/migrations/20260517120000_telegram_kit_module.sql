-- Contenido del kit por torneo (editable en backoffice)
CREATE TABLE IF NOT EXISTS public.tournament_telegram_kit_content (
  tournament_id uuid PRIMARY KEY REFERENCES public.tournaments(id) ON DELETE CASCADE,
  greeting_line text NOT NULL DEFAULT 'Hola {player_name},',
  body_lines text NOT NULL DEFAULT '',
  footer_line text NOT NULL DEFAULT 'Cuando hayas recibido el kit, responde: RECIBIDO (completo) o RECIBIDO PARCIAL si aún te falta algo.',
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tournament_telegram_kit_content IS
  'Plantilla del mensaje de kit Telegram por torneo; {player_name} y {tournament_name}';

-- Entrega parcial / pendientes en inscripción
ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS telegram_kit_pending_items text,
  ADD COLUMN IF NOT EXISTS telegram_kit_partial_received_at timestamptz;

COMMENT ON COLUMN public.tournament_entries.telegram_kit_pending_items IS
  'Qué falta por entregar del kit (comité); vacío = entrega completa esperada';
COMMENT ON COLUMN public.tournament_entries.telegram_kit_partial_received_at IS
  'Jugador confirmó recepción parcial (RECIBIDO PARCIAL)';
