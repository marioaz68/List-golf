-- ============================================================================
-- Acciones manuales del cliente sobre sus favoritos del menú F&B.
--
-- Por default, los favoritos se calculan automáticamente del historial
-- (más pedidos = más arriba). Esta tabla permite al cliente:
--   - 'pinned'  → fijar un item como favorito permanente (aunque lo pida poco)
--   - 'hidden'  → ocultar un item de su lista de favoritos auto (aunque lo pida mucho)
--
-- El endpoint GET /api/captura/fb-favorites combina: pinned + auto - hidden.
--
-- Idempotente con DROP CONSTRAINT IF EXISTS para re-ejecutar sin error.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fb_favorite_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NULL REFERENCES public.tournament_entries (id) ON DELETE CASCADE,
  caddie_id uuid NULL REFERENCES public.caddies (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.fb_menu_items (id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('pinned', 'hidden')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_fav_one_actor CHECK (
    (entry_id IS NOT NULL AND caddie_id IS NULL) OR
    (entry_id IS NULL AND caddie_id IS NOT NULL)
  )
);

-- Un cliente solo puede tener UN action por item (pinned o hidden, no ambos).
-- Si pinea algo que tenía hidden, se sobreescribe.
CREATE UNIQUE INDEX IF NOT EXISTS fb_fav_entry_item_uniq
  ON public.fb_favorite_actions (entry_id, menu_item_id)
  WHERE entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fb_fav_caddie_item_uniq
  ON public.fb_favorite_actions (caddie_id, menu_item_id)
  WHERE caddie_id IS NOT NULL;

ALTER TABLE public.fb_favorite_actions ENABLE ROW LEVEL SECURITY;
-- Sin policies = solo service_role lee/escribe (los endpoints usan admin client).

COMMENT ON TABLE public.fb_favorite_actions IS
  'Acciones manuales del cliente sobre sus favoritos. pinned = fijar siempre; hidden = ocultar del auto.';
