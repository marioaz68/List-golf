-- Estados: editing → closed → applied
ALTER TABLE tournament_convocatoria
  DROP CONSTRAINT IF EXISTS tournament_convocatoria_status_check;

UPDATE tournament_convocatoria
SET status = 'editing'
WHERE status = 'draft';

ALTER TABLE tournament_convocatoria
  ADD CONSTRAINT tournament_convocatoria_status_check
  CHECK (status IN ('editing', 'closed', 'applied'));

ALTER TABLE tournament_convocatoria
  ALTER COLUMN status SET DEFAULT 'editing';
