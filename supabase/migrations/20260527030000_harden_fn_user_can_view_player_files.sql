-- Endurecer fn_user_can_view_player_files: fijar search_path y revocar
-- EXECUTE de PUBLIC. Solo authenticated/service_role pueden llamarla
-- (la usan las RLS policies, que corren con permisos del rol authenticated).

CREATE OR REPLACE FUNCTION public.fn_user_can_view_player_files(
  user_uuid uuid,
  pl_uuid uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    public.fn_user_is_super_admin(user_uuid)
    OR EXISTS (
      SELECT 1 FROM public.user_global_roles ug
      JOIN public.roles r ON r.id = ug.role_id
      WHERE ug.user_id = user_uuid
        AND ug.is_active = true
        AND r.code = 'handicap_committee'
    )
    OR EXISTS (
      SELECT 1
      FROM public.tournament_entries te
      JOIN public.user_tournament_roles utr
        ON utr.tournament_id = te.tournament_id
      JOIN public.roles r ON r.id = utr.role_id
      WHERE te.player_id = pl_uuid
        AND utr.user_id = user_uuid
        AND utr.is_active = true
        AND r.code IN ('handicap_committee', 'tournament_director')
    )
    OR EXISTS (
      SELECT 1
      FROM public.players p
      JOIN public.user_club_roles ucr ON ucr.club_id = p.club_id
      JOIN public.roles r ON r.id = ucr.role_id
      WHERE p.id = pl_uuid
        AND ucr.user_id = user_uuid
        AND ucr.is_active = true
        AND r.code IN ('club_admin', 'handicap_committee')
    );
$$;

REVOKE EXECUTE ON FUNCTION public.fn_user_can_view_player_files(uuid, uuid)
  FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fn_user_can_view_player_files(uuid, uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.fn_user_can_view_player_files(uuid, uuid)
  TO authenticated, service_role;
