-- Las FKs hacia tournament_entries son ON DELETE SET NULL, así que al
-- borrar un inscrito el equipo queda con player_a_entry_id o
-- player_b_entry_id en NULL y, si seguía marcado is_active=true,
-- aparece como un equipo "en blanco" en la lista (ver caso CCQ Mixto).
--
-- Trigger: si después de un INSERT/UPDATE el equipo no tiene jugador A
-- (o, en formato pairs, tampoco tiene B y el match_type vigente es
-- 'pairs'), lo desactivamos automáticamente.

CREATE OR REPLACE FUNCTION public.matchplay_pair_teams_autodeactivate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_type text;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NEW.player_a_entry_id IS NULL THEN
    NEW.is_active := false;
    RETURN NEW;
  END IF;

  SELECT match_type INTO v_match_type
  FROM public.tournament_matchplay_rules
  WHERE tournament_id = NEW.tournament_id;

  IF COALESCE(v_match_type, 'pairs') = 'pairs'
    AND NEW.player_b_entry_id IS NULL THEN
    NEW.is_active := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_matchplay_pair_teams_autodeactivate
  ON public.matchplay_pair_teams;

CREATE TRIGGER trg_matchplay_pair_teams_autodeactivate
  BEFORE INSERT OR UPDATE OF player_a_entry_id, player_b_entry_id, is_active
  ON public.matchplay_pair_teams
  FOR EACH ROW
  EXECUTE FUNCTION public.matchplay_pair_teams_autodeactivate();

-- Limpieza de huérfanos existentes (por si quedaron equipos vivos sin
-- inscritos asociados en otros torneos).
UPDATE public.matchplay_pair_teams
SET is_active = false,
    updated_at = NOW()
WHERE is_active = true
  AND player_a_entry_id IS NULL;
