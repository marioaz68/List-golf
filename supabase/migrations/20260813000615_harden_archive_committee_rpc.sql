-- Endurece fn_archive_and_reset_handicap_committee_votes:
-- solo service_role, actor explícito, archived_by/tournament_id no confiables del payload.

DROP FUNCTION IF EXISTS public.fn_archive_and_reset_handicap_committee_votes(uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.fn_archive_and_reset_handicap_committee_votes(
  p_committee_id uuid,
  p_actor_user_id uuid,
  p_session jsonb,
  p_snapshots jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session_id uuid;
  v_vote_count integer;
  v_tournament_id uuid;
BEGIN
  IF p_committee_id IS NULL OR p_actor_user_id IS NULL THEN
    RAISE EXCEPTION 'parámetros requeridos';
  END IF;

  -- Validación propia (SECURITY DEFINER): no confiar solo en grants.
  -- La server action usa service_role (auth.uid() sería null), por eso el
  -- actor se pasa explícito y se verifica aquí.
  IF NOT public.fn_user_can_read_ghin(p_actor_user_id) THEN
    RAISE EXCEPTION 'no autorizado';
  END IF;

  SELECT c.tournament_id
    INTO v_tournament_id
  FROM public.tournament_handicap_committees c
  WHERE c.id = p_committee_id;

  IF v_tournament_id IS NULL THEN
    RAISE EXCEPTION 'comité no encontrado';
  END IF;

  -- Si el payload trae tournament_id, debe coincidir con el del comité.
  IF p_session IS NOT NULL
     AND NULLIF(p_session->>'tournament_id', '') IS NOT NULL
     AND (p_session->>'tournament_id')::uuid IS DISTINCT FROM v_tournament_id THEN
    RAISE EXCEPTION 'tournament_id no corresponde al comité';
  END IF;

  SELECT count(*)::integer INTO v_vote_count
  FROM public.handicap_committee_votes
  WHERE committee_id = p_committee_id;

  IF v_vote_count = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.handicap_committee_vote_sessions (
    committee_id,
    tournament_id,
    session_no,
    name,
    notes,
    archived_by,
    trim_high,
    trim_low,
    disqualify_threshold,
    abstentions_in_average,
    n_members_present,
    n_voters,
    n_entries
  )
  VALUES (
    p_committee_id,
    v_tournament_id,
    COALESCE((p_session->>'session_no')::smallint, 1),
    NULLIF(p_session->>'name', ''),
    NULLIF(p_session->>'notes', ''),
    p_actor_user_id,
    COALESCE((p_session->>'trim_high')::smallint, 0),
    COALESCE((p_session->>'trim_low')::smallint, 0),
    COALESCE((p_session->>'disqualify_threshold')::smallint, 0),
    COALESCE((p_session->>'abstentions_in_average')::boolean, false),
    COALESCE((p_session->>'n_members_present')::smallint, 0),
    COALESCE((p_session->>'n_voters')::smallint, 0),
    COALESCE((p_session->>'n_entries')::smallint, 0)
  )
  RETURNING id INTO v_session_id;

  IF p_snapshots IS NOT NULL AND jsonb_typeof(p_snapshots) = 'array'
     AND jsonb_array_length(p_snapshots) > 0 THEN
    INSERT INTO public.handicap_committee_vote_snapshots (
      session_id,
      entry_id,
      entry_player_name,
      entry_handicap_index,
      entry_category_code,
      n_votes,
      n_abstained,
      n_disqualify,
      avg_adjustment,
      suggested_hi,
      votes_anon,
      trim_annulled
    )
    SELECT
      v_session_id,
      NULLIF(elem->>'entry_id', '')::uuid,
      NULLIF(elem->>'entry_player_name', ''),
      NULLIF(elem->>'entry_handicap_index', '')::numeric,
      NULLIF(elem->>'entry_category_code', ''),
      COALESCE((elem->>'n_votes')::smallint, 0),
      COALESCE((elem->>'n_abstained')::smallint, 0),
      COALESCE((elem->>'n_disqualify')::smallint, 0),
      NULLIF(elem->>'avg_adjustment', '')::numeric,
      NULLIF(elem->>'suggested_hi', '')::numeric,
      CASE
        WHEN elem ? 'votes_anon' AND elem->'votes_anon' IS NOT NULL
          AND jsonb_typeof(elem->'votes_anon') <> 'null'
        THEN elem->'votes_anon'
        ELSE NULL
      END,
      COALESCE((elem->>'trim_annulled')::boolean, false)
    FROM jsonb_array_elements(p_snapshots) AS elem;
  END IF;

  DELETE FROM public.handicap_committee_votes
  WHERE committee_id = p_committee_id;

  RETURN v_session_id;
END;
$$;

COMMENT ON FUNCTION public.fn_archive_and_reset_handicap_committee_votes(uuid, uuid, jsonb, jsonb) IS
  'Archiva sesión+snapshots y borra votos vivos en una transacción. Solo service_role; actor verificado con fn_user_can_read_ghin; archived_by y tournament_id no vienen del payload.';

REVOKE ALL ON FUNCTION public.fn_archive_and_reset_handicap_committee_votes(uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_archive_and_reset_handicap_committee_votes(uuid, uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.fn_archive_and_reset_handicap_committee_votes(uuid, uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_archive_and_reset_handicap_committee_votes(uuid, uuid, jsonb, jsonb) TO service_role;
