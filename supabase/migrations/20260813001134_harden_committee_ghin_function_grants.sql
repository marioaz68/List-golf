-- Endurece grants / search_path de helpers de comité y GHIN.

-- 1) SECURITY DEFINER sin search_path fijado → patrón de secuestro de schema.
ALTER FUNCTION public.fn_user_is_handicap_committee_member(uuid, uuid)
  SET search_path = public, auth;

REVOKE EXECUTE ON FUNCTION public.fn_user_is_handicap_committee_member(uuid, uuid)
  FROM anon, PUBLIC;

-- Se mantiene authenticated: la usan políticas RLS del comité con auth.uid().
-- service_role también conserva EXECUTE (default de owner / grants previos).
GRANT EXECUTE ON FUNCTION public.fn_user_is_handicap_committee_member(uuid, uuid)
  TO authenticated, service_role;

-- 2) f_ghin_*: INVOKER + RLS (anon ya recibe vacío), pero sin superficie PostgREST.
REVOKE EXECUTE ON FUNCTION public.f_ghin_escenario(text, integer, text)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_ghin_min_index(text, date, date)
  FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.f_ghin_holes_avg(text, integer)
  FROM anon, PUBLIC;

GRANT EXECUTE ON FUNCTION public.f_ghin_escenario(text, integer, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_ghin_min_index(text, date, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f_ghin_holes_avg(text, integer)
  TO authenticated, service_role;
