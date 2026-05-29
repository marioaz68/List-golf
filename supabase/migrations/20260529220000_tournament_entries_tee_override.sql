-- Override manual de salida (tee set) por jugador inscrito.
--
-- El comité del torneo puede cambiar la salida que se muestra al
-- jugador (kit, pairing, tee sheet) sin recalcular HC/PH. Útil cuando
-- se quiere mover a alguien de salida por logística o consideraciones
-- especiales sin alterar los handicaps publicados.

ALTER TABLE public.tournament_entries
  ADD COLUMN IF NOT EXISTS tee_set_id_override uuid REFERENCES public.tee_sets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tee_set_override_at timestamptz,
  ADD COLUMN IF NOT EXISTS tee_set_override_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tee_set_override_reason text;

COMMENT ON COLUMN public.tournament_entries.tee_set_id_override IS
  'Salida (tee set) asignada manualmente por el comité. Sustituye a la salida calculada por reglas para mostrar al jugador, sin afectar HC ni PH del torneo.';

CREATE INDEX IF NOT EXISTS tournament_entries_tee_override_idx
  ON public.tournament_entries (tee_set_id_override)
  WHERE tee_set_id_override IS NOT NULL;
