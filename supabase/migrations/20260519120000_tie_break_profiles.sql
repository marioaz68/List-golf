-- Perfiles de desempate por torneo (si no existían en el proyecto remoto).
CREATE TABLE IF NOT EXISTS public.tie_break_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments (id) ON DELETE CASCADE,
  name text NOT NULL,
  applies_to text NOT NULL DEFAULT 'cut',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer,
  notes text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tie_break_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tie_break_profile_id uuid NOT NULL REFERENCES public.tie_break_profiles (id) ON DELETE CASCADE,
  step_no integer NOT NULL,
  method text NOT NULL DEFAULT 'segment_compare',
  basis text NOT NULL DEFAULT 'gross',
  round_scope text NOT NULL DEFAULT 'last_in_range',
  hole_scope text NOT NULL,
  handicap_mode text NOT NULL DEFAULT 'none',
  direction text NOT NULL DEFAULT 'lower_is_better',
  value_text text,
  UNIQUE (tie_break_profile_id, step_no)
);

CREATE INDEX IF NOT EXISTS idx_tie_break_profiles_tournament
  ON public.tie_break_profiles (tournament_id);
