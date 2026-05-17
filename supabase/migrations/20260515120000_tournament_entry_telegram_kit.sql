-- Kit Telegram por inscripción (envío y confirmación de recibido)
ALTER TABLE tournament_entries
  ADD COLUMN IF NOT EXISTS telegram_kit_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS telegram_kit_received_at timestamptz;

COMMENT ON COLUMN tournament_entries.telegram_kit_sent_at IS 'Cuándo el comité envió el kit por Telegram';
COMMENT ON COLUMN tournament_entries.telegram_kit_received_at IS 'Cuándo el jugador confirmó recibido (ej. RECIBIDO)';
