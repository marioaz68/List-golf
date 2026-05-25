-- =====================================================================
-- COMITÉ DE HANDICAP (por torneo)
--
-- Cada torneo puede tener un comité de hasta 9 miembros que votan, de
-- manera anónima entre ellos, un ajuste de handicap (solo a la baja:
-- −0.5 a −5.0 en pasos de 0.1) para cada jugador inscrito.
-- El comité opera sobre `tournament_entries`; el resultado queda como
-- ajuste sugerido que el admin del torneo aplica manualmente al
-- `handicap_index` del entry.
-- =====================================================================

-- 1) Rol nuevo en catálogo `roles` -------------------------------------
INSERT INTO roles (code, name, description)
SELECT 'handicap_committee', 'Comité de Handicap', 'Vota ajustes a la baja de HI de jugadores inscritos en un torneo (acceso solo al módulo de comité).'
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'handicap_committee');

-- 2) Comité por torneo (1 fila por torneo) ----------------------------
CREATE TABLE IF NOT EXISTS tournament_handicap_committees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  expected_members int NOT NULL DEFAULT 9 CHECK (expected_members > 0 AND expected_members <= 50),
  opens_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz,
  closed_by uuid REFERENCES profiles(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tournament_id)
);

CREATE INDEX IF NOT EXISTS idx_handicap_committees_tournament
  ON tournament_handicap_committees (tournament_id);

-- 3) Voto individual ---------------------------------------------------
-- adjustment se guarda como negativo (-0.5 a -5.0).
-- abstained = TRUE cuando el miembro decide no opinar de ese jugador.
CREATE TABLE IF NOT EXISTS handicap_committee_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  committee_id uuid NOT NULL REFERENCES tournament_handicap_committees(id) ON DELETE CASCADE,
  tournament_id uuid NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
  entry_id uuid NOT NULL REFERENCES tournament_entries(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  adjustment numeric(3,1),
  abstained boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT handicap_vote_unique UNIQUE (committee_id, entry_id, member_user_id),
  CONSTRAINT handicap_vote_value_check CHECK (
    abstained = true
    OR (
      adjustment IS NOT NULL
      AND adjustment <= -0.5
      AND adjustment >= -5.0
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_handicap_votes_committee ON handicap_committee_votes (committee_id);
CREATE INDEX IF NOT EXISTS idx_handicap_votes_entry ON handicap_committee_votes (entry_id);
CREATE INDEX IF NOT EXISTS idx_handicap_votes_member ON handicap_committee_votes (member_user_id);

-- 4) Trigger updated_at ------------------------------------------------
CREATE OR REPLACE FUNCTION handicap_committee_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_handicap_committees_touch ON tournament_handicap_committees;
CREATE TRIGGER trg_handicap_committees_touch
  BEFORE UPDATE ON tournament_handicap_committees
  FOR EACH ROW EXECUTE FUNCTION handicap_committee_touch_updated_at();

DROP TRIGGER IF EXISTS trg_handicap_votes_touch ON handicap_committee_votes;
CREATE TRIGGER trg_handicap_votes_touch
  BEFORE UPDATE ON handicap_committee_votes
  FOR EACH ROW EXECUTE FUNCTION handicap_committee_touch_updated_at();

-- 5) Vista agregada anonimizada ---------------------------------------
-- Expone solo agregados; NUNCA muestra qué miembro votó qué.
-- Útil para que admin/comité oficial vea el resultado consolidado.
CREATE OR REPLACE VIEW handicap_committee_vote_summary AS
SELECT
  v.committee_id,
  v.tournament_id,
  v.entry_id,
  COUNT(*) FILTER (WHERE v.abstained = false) AS n_votes,
  COUNT(*) FILTER (WHERE v.abstained = true) AS n_abstained,
  COUNT(*) AS n_total,
  AVG(v.adjustment) FILTER (WHERE v.abstained = false) AS avg_adjustment,
  MIN(v.adjustment) FILTER (WHERE v.abstained = false) AS min_adjustment,
  MAX(v.adjustment) FILTER (WHERE v.abstained = false) AS max_adjustment,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY v.adjustment)
    FILTER (WHERE v.abstained = false) AS median_adjustment
FROM handicap_committee_votes v
GROUP BY v.committee_id, v.tournament_id, v.entry_id;

-- 6) RLS ---------------------------------------------------------------
ALTER TABLE tournament_handicap_committees ENABLE ROW LEVEL SECURITY;
ALTER TABLE handicap_committee_votes ENABLE ROW LEVEL SECURITY;

-- Helpers (idempotentes)
CREATE OR REPLACE FUNCTION fn_user_is_super_admin(user_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_global_roles ug
    JOIN roles r ON r.id = ug.role_id
    WHERE ug.user_id = user_uuid
      AND ug.is_active = true
      AND r.code = 'super_admin'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_user_can_manage_tournament(user_uuid uuid, tour_uuid uuid)
RETURNS boolean AS $$
  SELECT
    fn_user_is_super_admin(user_uuid)
    OR EXISTS (
      SELECT 1
      FROM user_tournament_roles utr
      JOIN roles r ON r.id = utr.role_id
      WHERE utr.user_id = user_uuid
        AND utr.tournament_id = tour_uuid
        AND utr.is_active = true
        AND r.code IN ('tournament_director')
    )
    OR EXISTS (
      SELECT 1
      FROM tournaments t
      JOIN user_club_roles ucr ON ucr.club_id = t.club_id
      JOIN roles r ON r.id = ucr.role_id
      WHERE t.id = tour_uuid
        AND ucr.user_id = user_uuid
        AND ucr.is_active = true
        AND r.code = 'club_admin'
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION fn_user_is_handicap_committee_member(user_uuid uuid, tour_uuid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1
    FROM user_tournament_roles utr
    JOIN roles r ON r.id = utr.role_id
    WHERE utr.user_id = user_uuid
      AND utr.tournament_id = tour_uuid
      AND utr.is_active = true
      AND r.code = 'handicap_committee'
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Política: SELECT comité --------------------------------------------
-- Admin del torneo y miembros del comité pueden VER la fila de
-- configuración del comité (no expone votos).
DROP POLICY IF EXISTS handicap_committees_select ON tournament_handicap_committees;
CREATE POLICY handicap_committees_select ON tournament_handicap_committees
  FOR SELECT TO authenticated
  USING (
    fn_user_can_manage_tournament(auth.uid(), tournament_id)
    OR fn_user_is_handicap_committee_member(auth.uid(), tournament_id)
  );

-- Política: INSERT/UPDATE/DELETE comité ------------------------------
DROP POLICY IF EXISTS handicap_committees_mutate ON tournament_handicap_committees;
CREATE POLICY handicap_committees_mutate ON tournament_handicap_committees
  FOR ALL TO authenticated
  USING (fn_user_can_manage_tournament(auth.uid(), tournament_id))
  WITH CHECK (fn_user_can_manage_tournament(auth.uid(), tournament_id));

-- Política: VER votos ---------------------------------------------------
-- IMPORTANTE: por anonimato, los miembros del comité SOLO pueden ver
-- sus propios votos. El admin del torneo NO puede leer la tabla
-- directamente (los ve solo a través de la vista agregada).
DROP POLICY IF EXISTS handicap_votes_select_self ON handicap_committee_votes;
CREATE POLICY handicap_votes_select_self ON handicap_committee_votes
  FOR SELECT TO authenticated
  USING (member_user_id = auth.uid());

-- Política: INSERTAR voto ----------------------------------------------
-- Cada miembro inserta sus propios votos para el comité del torneo
-- donde tiene rol handicap_committee y mientras el comité esté abierto.
DROP POLICY IF EXISTS handicap_votes_insert_self ON handicap_committee_votes;
CREATE POLICY handicap_votes_insert_self ON handicap_committee_votes
  FOR INSERT TO authenticated
  WITH CHECK (
    member_user_id = auth.uid()
    AND fn_user_is_handicap_committee_member(auth.uid(), tournament_id)
    AND EXISTS (
      SELECT 1 FROM tournament_handicap_committees c
      WHERE c.id = committee_id
        AND c.tournament_id = tournament_id
        AND c.status = 'open'
    )
  );

-- Política: ACTUALIZAR voto propio (mientras esté abierto) ----------
DROP POLICY IF EXISTS handicap_votes_update_self ON handicap_committee_votes;
CREATE POLICY handicap_votes_update_self ON handicap_committee_votes
  FOR UPDATE TO authenticated
  USING (
    member_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tournament_handicap_committees c
      WHERE c.id = committee_id
        AND c.status = 'open'
    )
  )
  WITH CHECK (
    member_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tournament_handicap_committees c
      WHERE c.id = committee_id
        AND c.status = 'open'
    )
  );

-- Política: BORRAR voto propio (mientras esté abierto) -------------
DROP POLICY IF EXISTS handicap_votes_delete_self ON handicap_committee_votes;
CREATE POLICY handicap_votes_delete_self ON handicap_committee_votes
  FOR DELETE TO authenticated
  USING (
    member_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM tournament_handicap_committees c
      WHERE c.id = committee_id
        AND c.status = 'open'
    )
  );

-- 7) Grants en la vista (anon/auth pueden leer agregado) -------------
GRANT SELECT ON handicap_committee_vote_summary TO authenticated;

COMMENT ON TABLE tournament_handicap_committees IS
  'Configuración del Comité de Handicap por torneo. Estado open=miembros pueden votar, closed=lectura/cierre.';
COMMENT ON TABLE handicap_committee_votes IS
  'Voto individual y privado de cada miembro del comité para cada jugador inscrito. Solo el propio miembro lo lee; el admin solo ve agregados vía handicap_committee_vote_summary.';
COMMENT ON VIEW handicap_committee_vote_summary IS
  'Agregado anonimizado de votos por jugador (entry_id). Cualquier admin/tournament_director con acceso al torneo puede consultarlo.';
