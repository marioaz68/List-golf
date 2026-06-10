-- Puntos de referencia por hoyo (bunkers, agua, dogleg, etc.) para rangefinder.

CREATE TABLE IF NOT EXISTS public.course_hole_reference_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  hole_number smallint NOT NULL CHECK (hole_number BETWEEN 1 AND 18),
  label text NOT NULL,
  short_label text NULL,
  kind text NOT NULL DEFAULT 'other'
    CHECK (kind IN ('bunker', 'water', 'dogleg', 'hazard', 'other', 'custom')),
  lat double precision NOT NULL,
  lon double precision NOT NULL,
  sort_order smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_hole_ref_points_course_hole
  ON public.course_hole_reference_points (course_id, hole_number, sort_order);

COMMENT ON TABLE public.course_hole_reference_points IS
  'Puntos nombrados del campo (bunker, agua, dogleg…) mostrados en la mini app de yardas.';

ALTER TABLE public.course_hole_reference_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "course_hole_reference_points_select_authenticated"
  ON public.course_hole_reference_points FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "course_hole_reference_points_write_authenticated"
  ON public.course_hole_reference_points FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
