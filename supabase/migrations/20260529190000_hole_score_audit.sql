-- Auditoría de captura/modificación de hole_scores
--
-- Se registra cada vez que la aplicación crea, modifica o borra un
-- score de hoyo. Permite al comité ver quién capturó cada hoyo y
-- quién lo modificó después.
--
-- El actor se identifica con:
--   - actor_entry_id  → jugador del torneo capturando (URL ?me=)
--   - actor_caddie_id → caddie capturando (URL ?caddie=)
--   - actor_user_id   → usuario backoffice autenticado
--   - actor_role      → 'player' | 'caddie' | 'witness' | 'admin'
--   - actor_label     → nombre legible al momento de la captura
--   - source          → 'telegram_player' | 'telegram_caddie'
--                       | 'telegram_witness' | 'backoffice'
--                       | 'public' | 'unknown'
--
-- No se vincula a hole_scores por id porque las filas pueden borrarse
-- y queremos conservar la historia.

CREATE TABLE IF NOT EXISTS public.hole_score_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL,
  entry_id uuid NOT NULL,
  hole_no integer NOT NULL CHECK (hole_no BETWEEN 1 AND 27),
  action text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  old_strokes integer,
  new_strokes integer,
  old_picked_up boolean,
  new_picked_up boolean,
  old_pending_witness boolean,
  new_pending_witness boolean,
  actor_role text CHECK (
    actor_role IS NULL
    OR actor_role IN ('player', 'caddie', 'witness', 'admin', 'system')
  ),
  actor_entry_id uuid,
  actor_caddie_id uuid,
  actor_user_id uuid,
  actor_label text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hole_score_audit_round_entry_hole_idx
  ON public.hole_score_audit (round_id, entry_id, hole_no);

CREATE INDEX IF NOT EXISTS hole_score_audit_round_created_idx
  ON public.hole_score_audit (round_id, created_at DESC);

CREATE INDEX IF NOT EXISTS hole_score_audit_actor_user_idx
  ON public.hole_score_audit (actor_user_id)
  WHERE actor_user_id IS NOT NULL;

COMMENT ON TABLE public.hole_score_audit IS
  'Bitácora de capturas/modificaciones/borrados de hole_scores con identidad del actor.';

ALTER TABLE public.hole_score_audit ENABLE ROW LEVEL SECURITY;

-- Service role escribe; lecturas del backoffice pasan por el service role
-- de los Server Components/Routes (createAdminClient). No exponemos
-- políticas públicas para que la bitácora sea solo accesible vía admin.
DROP POLICY IF EXISTS "hole_score_audit_admin_all" ON public.hole_score_audit;
CREATE POLICY "hole_score_audit_admin_all"
  ON public.hole_score_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
