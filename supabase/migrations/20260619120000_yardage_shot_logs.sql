-- Registro completo de la mini app Yardas (golpes, castigos, salidas, GPS)
-- para estadísticas futuras. El payload es el HoleShotsStore (JSON).

CREATE TABLE IF NOT EXISTS public.yardage_shot_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  entry_id uuid REFERENCES public.tournament_entries (id) ON DELETE SET NULL,
  caddie_id uuid REFERENCES public.caddies (id) ON DELETE SET NULL,
  telegram_user_id bigint,
  round_id uuid REFERENCES public.tournament_rounds (id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses (id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  payload_version integer NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT yardage_shot_logs_scope_key_unique UNIQUE (scope_key)
);

CREATE INDEX IF NOT EXISTS yardage_shot_logs_entry_idx
  ON public.yardage_shot_logs (entry_id)
  WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS yardage_shot_logs_round_idx
  ON public.yardage_shot_logs (round_id, updated_at DESC)
  WHERE round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS yardage_shot_logs_updated_idx
  ON public.yardage_shot_logs (updated_at DESC);

COMMENT ON TABLE public.yardage_shot_logs IS
  'Snapshot de golpes/castigos de Yardas por jugador o sesión Telegram; base para estadísticas.';

ALTER TABLE public.yardage_shot_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yardage_shot_logs_service_all" ON public.yardage_shot_logs;
CREATE POLICY "yardage_shot_logs_service_all"
  ON public.yardage_shot_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
