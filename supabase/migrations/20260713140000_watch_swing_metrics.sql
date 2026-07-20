-- Métricas de swing del Apple Watch (velocidad y ángulo back/forward).

ALTER TABLE public.watch_swing_events
  ADD COLUMN IF NOT EXISTS backswing_velocity_dps double precision,
  ADD COLUMN IF NOT EXISTS forwardswing_velocity_dps double precision,
  ADD COLUMN IF NOT EXISTS backswing_club_deg double precision,
  ADD COLUMN IF NOT EXISTS forward_club_deg double precision;

COMMENT ON COLUMN public.watch_swing_events.backswing_velocity_dps IS
  'Velocidad angular pico en backswing (°/s), estimada desde muñeca.';
COMMENT ON COLUMN public.watch_swing_events.forwardswing_velocity_dps IS
  'Velocidad angular pico en bajada/impacto (°/s).';
COMMENT ON COLUMN public.watch_swing_events.backswing_club_deg IS
  'Ángulo muñeca/bastón en tope vs address (°).';
COMMENT ON COLUMN public.watch_swing_events.forward_club_deg IS
  'Ángulo muñeca/bastón del tope al impacto (°).';
