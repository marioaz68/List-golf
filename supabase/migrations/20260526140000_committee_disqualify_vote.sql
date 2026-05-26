-- Voto del comité para "no permitir jugar torneo" por jugador.
-- Es independiente del ajuste de HI: un miembro puede abstenerse del ajuste
-- pero marcar que ese jugador no debe jugar, o aplicar un ajuste y además
-- recomendar excluirlo del torneo.

ALTER TABLE public.handicap_committee_votes
  ADD COLUMN IF NOT EXISTS disqualify_vote boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.handicap_committee_votes.disqualify_vote IS
  'Voto anónimo del miembro del comité para no permitir que este jugador participe en el torneo (independiente del ajuste de HI).';
