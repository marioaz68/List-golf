-- Eventos de swing detectados por Apple Watch (fase 2: relay iPhone → API).

CREATE TABLE IF NOT EXISTS public.watch_swing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL,
  round_id uuid,
  group_id uuid,
  entry_id uuid,
  caddie_id uuid,
  player_id uuid,
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  hoyo_detectado integer,
  swing_no integer,
  detected_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL DEFAULT 'watch',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS watch_swing_events_round_idx
  ON public.watch_swing_events (round_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS watch_swing_events_entry_idx
  ON public.watch_swing_events (entry_id, detected_at DESC)
  WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS watch_swing_events_caddie_idx
  ON public.watch_swing_events (caddie_id, detected_at DESC)
  WHERE caddie_id IS NOT NULL;

COMMENT ON TABLE public.watch_swing_events IS
  'Swings detectados por Apple Watch; el iPhone reenvía vía WatchConnectivity.';

ALTER TABLE public.watch_swing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "watch_swing_events_service_all" ON public.watch_swing_events;
CREATE POLICY "watch_swing_events_service_all"
  ON public.watch_swing_events
  FOR ALL
  USING (true)
  WITH CHECK (true);
