-- Almacenamiento remoto de la bolsa de bastones/distancias por jugador/sesión.
CREATE TABLE IF NOT EXISTS public.yardage_player_bags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_key text NOT NULL,
  entry_id uuid REFERENCES public.tournament_entries (id) ON DELETE SET NULL,
  caddie_id uuid REFERENCES public.caddies (id) ON DELETE SET NULL,
  telegram_user_id bigint,
  round_id uuid REFERENCES public.rounds (id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses (id) ON DELETE SET NULL,
  payload jsonb NOT NULL,
  payload_version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT yardage_player_bags_scope_key_unique UNIQUE (scope_key)
);

CREATE INDEX IF NOT EXISTS yardage_player_bags_entry_idx
  ON public.yardage_player_bags (entry_id)
  WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS yardage_player_bags_round_idx
  ON public.yardage_player_bags (round_id, updated_at DESC)
  WHERE round_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS yardage_player_bags_updated_idx
  ON public.yardage_player_bags (updated_at DESC);

COMMENT ON TABLE public.yardage_player_bags IS
  'Snapshot de la bolsa de bastones/distancias por jugador o sesión Telegram.';

ALTER TABLE public.yardage_player_bags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "yardage_player_bags_service_all" ON public.yardage_player_bags;
CREATE POLICY "yardage_player_bags_service_all"
  ON public.yardage_player_bags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
