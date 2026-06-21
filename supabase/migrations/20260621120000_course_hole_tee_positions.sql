-- Posición GPS de cada salida (tee) por hoyo y color de marcadores del CCQ.

CREATE TABLE IF NOT EXISTS public.course_hole_tee_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  tee_set_code text NOT NULL CHECK (char_length(trim(tee_set_code)) > 0),
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, hole_number, tee_set_code)
);

CREATE INDEX IF NOT EXISTS idx_course_hole_tee_positions_course_code
  ON public.course_hole_tee_positions (course_id, tee_set_code, hole_number);

COMMENT ON TABLE public.course_hole_tee_positions IS
  'Salidas calibradas por hoyo y set (Negras/Azules/Blancas/Doradas/Rojas) para Yardas.';

ALTER TABLE public.course_hole_tee_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_hole_tee_positions_select_authenticated"
  ON public.course_hole_tee_positions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "course_hole_tee_positions_write_authenticated"
  ON public.course_hole_tee_positions FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
