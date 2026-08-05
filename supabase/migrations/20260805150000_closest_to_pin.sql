-- Premios «más cerca de la bandera» en pares 3.
-- Captura por grupo (distancia al pin); ranking público por hoyo (1.º = más cercano).
-- Máx. de lugares premiados se aplica en aplicación (hasta 15).

CREATE TABLE IF NOT EXISTS public.closest_to_pin_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  round_id uuid NOT NULL REFERENCES public.rounds(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  entry_id uuid NOT NULL REFERENCES public.tournament_entries(id) ON DELETE CASCADE,
  -- Distancia a la bandera en centímetros (0 = en el palo). Soporta mm vía redondeo.
  distance_cm integer NOT NULL CHECK (distance_cm >= 0 AND distance_cm <= 100000),
  group_id uuid NULL REFERENCES public.pairing_groups(id) ON DELETE SET NULL,
  captured_by_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  note text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (round_id, hole_number, entry_id)
);

CREATE INDEX IF NOT EXISTS idx_ctp_tournament_round_hole_dist
  ON public.closest_to_pin_entries
  (tournament_id, round_id, hole_number, distance_cm ASC);

CREATE INDEX IF NOT EXISTS idx_ctp_group
  ON public.closest_to_pin_entries (group_id)
  WHERE group_id IS NOT NULL;

COMMENT ON TABLE public.closest_to_pin_entries IS
  'Más cerca de la bandera (pares 3): una distancia por jugador, ronda y hoyo.';
COMMENT ON COLUMN public.closest_to_pin_entries.distance_cm IS
  'Distancia a la bandera en centímetros. Menor valor = más cerca = mejor lugar.';

ALTER TABLE public.closest_to_pin_entries ENABLE ROW LEVEL SECURITY;

-- Lectura pública (tablero en vivo del torneo).
CREATE POLICY "ctp_select_public"
  ON public.closest_to_pin_entries FOR SELECT
  TO anon, authenticated
  USING (true);

-- Escritura solo usuarios autenticados (staff; las páginas filtran por rol).
CREATE POLICY "ctp_write_authenticated"
  ON public.closest_to_pin_entries FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
