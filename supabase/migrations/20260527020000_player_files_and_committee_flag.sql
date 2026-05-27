-- =====================================================================
-- PLAYER FILES + FLAG PARA COMITÉ DE HANDICAP
--
-- 1) Tabla player_files: archivos adjuntos al jugador (reportes GHIN,
--    capturas de pantalla, PDF, HTML). Privados; el comité de cualquier
--    torneo donde el jugador esté inscrito puede leer (URL firmada).
-- 2) Bucket de Storage `player-files` (privado).
-- 3) tournament_entries.flagged_for_committee + reason: el director del
--    torneo marca jugadores que el comité debe revisar con prioridad.
-- =====================================================================

-- 1) Tabla -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.player_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  ghin_number text,
  kind text NOT NULL DEFAULT 'handicap_report'
    CHECK (kind IN ('handicap_report', 'screenshot', 'other')),
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  notes text,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_path)
);

CREATE INDEX IF NOT EXISTS idx_player_files_player
  ON public.player_files (player_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_player_files_ghin
  ON public.player_files (ghin_number);
CREATE INDEX IF NOT EXISTS idx_player_files_kind
  ON public.player_files (player_id, kind);

COMMENT ON TABLE public.player_files IS
  'Archivos adjuntos al jugador (reportes GHIN, capturas, etc). Privados; comité de handicap puede leer vía URL firmada.';
COMMENT ON COLUMN public.player_files.file_path IS
  'Ruta dentro del bucket player-files. Ej: players/{ghin}/handicap-{ts}.html';

-- 2) Storage bucket ---------------------------------------------------
-- Privado: solo accesible vía signed URL.
INSERT INTO storage.buckets (id, name, public)
VALUES ('player-files', 'player-files', false)
ON CONFLICT (id) DO NOTHING;

-- 3) Flag en inscripciones --------------------------------------------
ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS flagged_for_committee boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flagged_committee_reason text,
  ADD COLUMN IF NOT EXISTS flagged_committee_at timestamptz,
  ADD COLUMN IF NOT EXISTS flagged_committee_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tournament_entries.flagged_for_committee IS
  'true = director/admin pidió que el comité revise este jugador con prioridad. Aparece destacado en /comite-handicap.';

CREATE INDEX IF NOT EXISTS idx_entries_committee_flagged
  ON public.tournament_entries (tournament_id) WHERE flagged_for_committee = true;

-- 4) RLS player_files --------------------------------------------------
ALTER TABLE public.player_files ENABLE ROW LEVEL SECURITY;

-- Función helper: ¿el usuario tiene rol handicap_committee O director en
-- algún torneo donde este jugador está inscrito? También permite a
-- super_admin y club_admin del club del jugador.
CREATE OR REPLACE FUNCTION public.fn_user_can_view_player_files(
  user_uuid uuid,
  pl_uuid uuid
)
RETURNS boolean AS $$
  SELECT
    -- super_admin
    fn_user_is_super_admin(user_uuid)
    -- comité global
    OR EXISTS (
      SELECT 1 FROM user_global_roles ug
      JOIN roles r ON r.id = ug.role_id
      WHERE ug.user_id = user_uuid
        AND ug.is_active = true
        AND r.code = 'handicap_committee'
    )
    -- comité o director de cualquier torneo donde el jugador esté inscrito
    OR EXISTS (
      SELECT 1
      FROM tournament_entries te
      JOIN user_tournament_roles utr ON utr.tournament_id = te.tournament_id
      JOIN roles r ON r.id = utr.role_id
      WHERE te.player_id = pl_uuid
        AND utr.user_id = user_uuid
        AND utr.is_active = true
        AND r.code IN ('handicap_committee', 'tournament_director')
    )
    -- club_admin o committee del club del jugador
    OR EXISTS (
      SELECT 1
      FROM players p
      JOIN user_club_roles ucr ON ucr.club_id = p.club_id
      JOIN roles r ON r.id = ucr.role_id
      WHERE p.id = pl_uuid
        AND ucr.user_id = user_uuid
        AND ucr.is_active = true
        AND r.code IN ('club_admin', 'handicap_committee')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- SELECT
DROP POLICY IF EXISTS player_files_select ON public.player_files;
CREATE POLICY player_files_select ON public.player_files
  FOR SELECT TO authenticated
  USING (fn_user_can_view_player_files(auth.uid(), player_id));

-- INSERT/UPDATE/DELETE solo admins (lo escribe la server action con
-- service_role, así que esta política es defensiva).
DROP POLICY IF EXISTS player_files_mutate ON public.player_files;
CREATE POLICY player_files_mutate ON public.player_files
  FOR ALL TO authenticated
  USING (
    fn_user_is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM players p
      JOIN user_club_roles ucr ON ucr.club_id = p.club_id
      JOIN roles r ON r.id = ucr.role_id
      WHERE p.id = player_id
        AND ucr.user_id = auth.uid()
        AND ucr.is_active = true
        AND r.code = 'club_admin'
    )
  )
  WITH CHECK (
    fn_user_is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1
      FROM players p
      JOIN user_club_roles ucr ON ucr.club_id = p.club_id
      JOIN roles r ON r.id = ucr.role_id
      WHERE p.id = player_id
        AND ucr.user_id = auth.uid()
        AND ucr.is_active = true
        AND r.code = 'club_admin'
    )
  );

-- 5) Storage policies para bucket player-files ------------------------
-- SELECT (lectura del binario): cualquiera que pueda ver el row de
-- player_files puede pedir el archivo. La policy revisa que exista un
-- player_files cuyo file_path == storage object name y que el usuario
-- tenga acceso al player vinculado.
DROP POLICY IF EXISTS "player-files read" ON storage.objects;
CREATE POLICY "player-files read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'player-files'
    AND EXISTS (
      SELECT 1
      FROM public.player_files pf
      WHERE pf.file_path = storage.objects.name
        AND fn_user_can_view_player_files(auth.uid(), pf.player_id)
    )
  );

-- INSERT/UPDATE/DELETE del binario solo via service_role (la server
-- action). No agregamos policies de mutación para usuarios authenticated.
