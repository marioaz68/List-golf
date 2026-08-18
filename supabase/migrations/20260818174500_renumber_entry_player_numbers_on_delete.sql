-- Al borrar un inscrito, recompactar # 1..N para no dejar huecos
-- (el alta usa max(player_number)+1 y no reutiliza números borrados).

CREATE OR REPLACE FUNCTION public.renumber_tournament_entry_player_numbers(
  p_tournament_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  shift integer;
BEGIN
  IF p_tournament_id IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(max(player_number), 0) + 1000
  INTO shift
  FROM public.tournament_entries
  WHERE tournament_id = p_tournament_id;

  UPDATE public.tournament_entries
  SET player_number = player_number + shift
  WHERE tournament_id = p_tournament_id
    AND player_number IS NOT NULL;

  WITH ordered AS (
    SELECT
      id,
      row_number() OVER (
        ORDER BY player_number NULLS LAST, id
      ) AS n
    FROM public.tournament_entries
    WHERE tournament_id = p_tournament_id
  )
  UPDATE public.tournament_entries e
  SET player_number = o.n
  FROM ordered o
  WHERE e.id = o.id;
END;
$$;

REVOKE ALL ON FUNCTION public.renumber_tournament_entry_player_numbers(uuid)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.renumber_tournament_entry_player_numbers(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.trg_renumber_entries_after_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.renumber_tournament_entry_player_numbers(OLD.tournament_id);
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_renumber_tournament_entries_after_delete
  ON public.tournament_entries;

CREATE TRIGGER trg_renumber_tournament_entries_after_delete
AFTER DELETE ON public.tournament_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_renumber_entries_after_delete();
