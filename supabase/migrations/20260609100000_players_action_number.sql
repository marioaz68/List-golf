-- ============================================================
-- Número de acción / socio del jugador (alfanumérico, opcional).
--
-- Ejemplos: "A-145", "B-220", "SOC-001", "1234". Es el identificador
-- formal del socio dentro del club (independiente del GHIN). Se usa
-- en listados, cargos a cuenta y reportes internos.
-- ============================================================

ALTER TABLE public.players
  ADD COLUMN IF NOT EXISTS action_number text NULL;

COMMENT ON COLUMN public.players.action_number IS
  'Número de acción / socio dentro del club (alfanumérico). Distinto del GHIN.';

CREATE INDEX IF NOT EXISTS idx_players_action_number
  ON public.players (action_number)
  WHERE action_number IS NOT NULL;
