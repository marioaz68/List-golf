-- Umbral configurable: cuántos votos "No permitir jugar" se necesitan
-- para que el sistema considere al jugador como no autorizado.
-- 0 = desactivado (solo se muestra el conteo, sin marcar nada).

ALTER TABLE public.tournament_handicap_committees
  ADD COLUMN IF NOT EXISTS disqualify_threshold smallint NOT NULL DEFAULT 0
    CHECK (disqualify_threshold >= 0 AND disqualify_threshold <= 50);

COMMENT ON COLUMN public.tournament_handicap_committees.disqualify_threshold IS
  'Número mínimo de votos «No jugar» para que el sistema marque al jugador como no autorizado. 0 = desactivado (solo informativo).';
