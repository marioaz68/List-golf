-- Premios configurados para «más cerca de la bandera» por par 3 y lugar (1.º = más cercano).

CREATE TABLE IF NOT EXISTS public.closest_to_pin_prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  prize_position smallint NOT NULL CHECK (prize_position BETWEEN 1 AND 15),
  prize_label text NOT NULL,
  sponsor text NULL,
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id, hole_number, prize_position)
);

CREATE INDEX IF NOT EXISTS idx_ctp_prizes_tournament_hole
  ON public.closest_to_pin_prizes (tournament_id, hole_number, prize_position);

COMMENT ON TABLE public.closest_to_pin_prizes IS
  'Premios de más cerca de la bandera: un premio por (torneo, par 3, lugar 1–15).';

ALTER TABLE public.closest_to_pin_prizes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ctp_prizes_select_public"
  ON public.closest_to_pin_prizes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "ctp_prizes_write_authenticated"
  ON public.closest_to_pin_prizes FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
