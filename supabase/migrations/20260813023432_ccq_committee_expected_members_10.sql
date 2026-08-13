-- Quórum esperado del comité permanente CCQ = 10.
-- No toca votos ni sesiones archivadas. expected_members no entra a fórmulas.

UPDATE public.tournament_handicap_committees c
SET expected_members = 10
FROM public.tournaments t
WHERE c.tournament_id = t.id
  AND t.club_id = '14a694e1-e268-4090-951f-032570385731'
  AND c.expected_members IS DISTINCT FROM 10;
