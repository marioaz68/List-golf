-- Sesiones archivadas de la votación del comité de handicap.
-- Cada vez que se reinicia, se guarda aquí el resumen anónimo de la sesión
-- previa (votos por jugador + parámetros usados) para poder consultarla luego.

CREATE TABLE IF NOT EXISTS public.handicap_committee_vote_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES public.tournament_handicap_committees(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES public.tournaments(id) ON DELETE CASCADE,
  session_no smallint NOT NULL DEFAULT 1,
  name text,
  notes text,
  archived_at timestamptz NOT NULL DEFAULT now(),
  archived_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  trim_high smallint NOT NULL DEFAULT 0,
  trim_low smallint NOT NULL DEFAULT 0,
  disqualify_threshold smallint NOT NULL DEFAULT 0,
  n_members_present smallint NOT NULL DEFAULT 0,
  n_voters smallint NOT NULL DEFAULT 0,
  n_entries smallint NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_hcvs_committee
  ON public.handicap_committee_vote_sessions (committee_id, archived_at DESC);

CREATE TABLE IF NOT EXISTS public.handicap_committee_vote_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.handicap_committee_vote_sessions(id) ON DELETE CASCADE,
  entry_id uuid REFERENCES public.tournament_entries(id) ON DELETE SET NULL,
  entry_player_name text,
  entry_handicap_index numeric(5,1),
  entry_category_code text,
  n_votes smallint NOT NULL DEFAULT 0,
  n_abstained smallint NOT NULL DEFAULT 0,
  n_disqualify smallint NOT NULL DEFAULT 0,
  avg_adjustment numeric(5,2),
  suggested_hi numeric(5,1),
  votes_anon jsonb
);

CREATE INDEX IF NOT EXISTS idx_hcvsnap_session
  ON public.handicap_committee_vote_snapshots (session_id);

ALTER TABLE public.handicap_committee_vote_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.handicap_committee_vote_snapshots ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.handicap_committee_vote_sessions IS
  'Archivo de votaciones del comité: cada vez que se reinicia se guarda un resumen de la sesión previa.';
COMMENT ON TABLE public.handicap_committee_vote_snapshots IS
  'Snapshot anónimo por jugador de los votos archivados (suma, promedio, HI sugerido y lista de votos sin nombre).';
