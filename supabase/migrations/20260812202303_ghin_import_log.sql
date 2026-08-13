-- Log de cargas GHIN (histórico no existía; las 17 cargas previas no dejaron rastro).

CREATE TABLE IF NOT EXISTS public.ghin_import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file text NOT NULL,
  gender text CHECK (gender IN ('M', 'F', 'X') OR gender IS NULL),
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  rows_in_file integer NOT NULL DEFAULT 0,
  rows_inserted integer NOT NULL DEFAULT 0,
  rows_skipped integer NOT NULL DEFAULT 0,
  rows_date_conflict integer NOT NULL DEFAULT 0,
  date_min date,
  date_max date,
  status text NOT NULL DEFAULT 'dry_run'
    CHECK (status IN ('dry_run', 'applied', 'rejected', 'error')),
  notes text,
  report_json jsonb
);

CREATE INDEX IF NOT EXISTS idx_ghin_import_log_uploaded_at
  ON public.ghin_import_log (uploaded_at DESC);

ALTER TABLE public.ghin_import_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ghin_import_log_select_backoffice ON public.ghin_import_log;
CREATE POLICY ghin_import_log_select_backoffice ON public.ghin_import_log
  FOR SELECT TO authenticated
  USING (public.fn_user_can_read_ghin(auth.uid()));

-- Escritura solo service_role (server action con clave elevada tras validar rol).
REVOKE ALL ON TABLE public.ghin_import_log FROM anon, authenticated;
GRANT SELECT ON TABLE public.ghin_import_log TO authenticated;
GRANT ALL ON TABLE public.ghin_import_log TO service_role;

COMMENT ON TABLE public.ghin_import_log IS
  'Auditoría de cargas Hole-by-Hole / revisiones GHIN. dry_run antes de insertar.';
