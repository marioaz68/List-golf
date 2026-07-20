-- Vincula swings del Watch con yardage_shot_logs (punto 3).

ALTER TABLE public.watch_swing_events
  ADD COLUMN IF NOT EXISTS yardage_shot_id text,
  ADD COLUMN IF NOT EXISTS yardage_merged_at timestamptz;

CREATE INDEX IF NOT EXISTS watch_swing_events_merged_idx
  ON public.watch_swing_events (entry_id, detected_at DESC)
  WHERE yardage_merged_at IS NULL;

COMMENT ON COLUMN public.watch_swing_events.yardage_shot_id IS
  'ID del HoleShot en yardage_shot_logs (watch-{uuid}).';
