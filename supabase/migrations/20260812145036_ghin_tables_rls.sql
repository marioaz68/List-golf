-- RLS para tablas GHIN del club (datos personales de socios).
-- Antes: UNRESTRICTED + grants amplios a anon/authenticated.
-- Ahora: solo SELECT para roles de backoffice del comité / dirección;
-- escritura solo service_role (cargas ETL).

CREATE OR REPLACE FUNCTION public.fn_user_can_read_ghin(user_uuid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    public.fn_user_is_super_admin(user_uuid)
    OR EXISTS (
      SELECT 1
      FROM public.user_global_roles ug
      JOIN public.roles r ON r.id = ug.role_id
      WHERE ug.user_id = user_uuid
        AND ug.is_active = true
        AND r.code IN (
          'super_admin',
          'club_admin',
          'tournament_director',
          'handicap_committee',
          'entries_operator',
          'viewer'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_club_roles ucr
      JOIN public.roles r ON r.id = ucr.role_id
      WHERE ucr.user_id = user_uuid
        AND ucr.is_active = true
        AND r.code IN (
          'club_admin',
          'tournament_director',
          'handicap_committee',
          'entries_operator'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_tournament_roles utr
      JOIN public.roles r ON r.id = utr.role_id
      WHERE utr.user_id = user_uuid
        AND utr.is_active = true
        AND r.code IN (
          'club_admin',
          'tournament_director',
          'handicap_committee',
          'entries_operator'
        )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_user_can_read_ghin(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_can_read_ghin(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_user_can_read_ghin(uuid)
  TO authenticated, service_role;

ALTER TABLE public.ghin_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghin_index_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghin_competition_rounds ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ghin_rounds_select_backoffice ON public.ghin_rounds;
CREATE POLICY ghin_rounds_select_backoffice ON public.ghin_rounds
  FOR SELECT TO authenticated
  USING (public.fn_user_can_read_ghin(auth.uid()));

DROP POLICY IF EXISTS ghin_index_revisions_select_backoffice ON public.ghin_index_revisions;
CREATE POLICY ghin_index_revisions_select_backoffice ON public.ghin_index_revisions
  FOR SELECT TO authenticated
  USING (public.fn_user_can_read_ghin(auth.uid()));

DROP POLICY IF EXISTS ghin_competition_rounds_select_backoffice ON public.ghin_competition_rounds;
CREATE POLICY ghin_competition_rounds_select_backoffice ON public.ghin_competition_rounds
  FOR SELECT TO authenticated
  USING (public.fn_user_can_read_ghin(auth.uid()));

-- Cerrar escritura vía Data API (anon / authenticated).
REVOKE ALL ON TABLE public.ghin_rounds FROM anon, authenticated;
REVOKE ALL ON TABLE public.ghin_index_revisions FROM anon, authenticated;
REVOKE ALL ON TABLE public.ghin_competition_rounds FROM anon, authenticated;

GRANT SELECT ON TABLE public.ghin_rounds TO authenticated;
GRANT SELECT ON TABLE public.ghin_index_revisions TO authenticated;
GRANT SELECT ON TABLE public.ghin_competition_rounds TO authenticated;

GRANT ALL ON TABLE public.ghin_rounds TO service_role;
GRANT ALL ON TABLE public.ghin_index_revisions TO service_role;
GRANT ALL ON TABLE public.ghin_competition_rounds TO service_role;

-- Vistas: invoker para respetar RLS de las tablas base.
DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.v_ghin_player_activity SET (security_invoker = true)';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  BEGIN
    EXECUTE 'ALTER VIEW public.v_ghin_competition_summary SET (security_invoker = true)';
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

GRANT SELECT ON public.v_ghin_player_activity TO authenticated;
GRANT SELECT ON public.v_ghin_competition_summary TO authenticated;

GRANT EXECUTE ON FUNCTION public.f_ghin_escenario(text, integer, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_ghin_min_index(text, date, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_ghin_holes_avg(text, integer)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.fn_user_can_read_ghin(uuid) IS
  'Lectura GHIN (rondas/índice/competencia) para roles de backoffice/comité. Alineado con canAccessAnyBackofficeModule / comite-handicap.';
