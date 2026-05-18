-- Convocatoria: documento fuente + borrador de parametrización (no reemplaza tablas existentes).
CREATE TABLE IF NOT EXISTS tournament_convocatoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  file_name text,
  extracted_text text,
  draft_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tournament_convocatoria_tournament
  ON tournament_convocatoria (tournament_id);

CREATE INDEX IF NOT EXISTS idx_tournament_convocatoria_status
  ON tournament_convocatoria (status);
