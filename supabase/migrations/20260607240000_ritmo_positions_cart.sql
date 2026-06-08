-- ============================================================================
-- Permite a los carritos bar mandar su ubicación GPS al sistema de ritmo.
--
-- Los carritos son un actor más en `ritmo_positions`:
--   - jugador  : player_id set, otros null
--   - caddie   : telegram_user_id de caddie, otros null
--   - carrito  : fb_venue_id set apuntando a un venue tipo 'cart'
--
-- Los jugadores ven la ubicación del carrito en la Mini App cuando piden
-- al carrito, con ETA estimado al hoyo donde están.
-- ============================================================================

ALTER TABLE public.ritmo_positions
  ADD COLUMN IF NOT EXISTS fb_venue_id uuid NULL REFERENCES public.fb_venues (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ritmo_positions_cart_idx
  ON public.ritmo_positions (fb_venue_id, ts DESC)
  WHERE fb_venue_id IS NOT NULL;

COMMENT ON COLUMN public.ritmo_positions.fb_venue_id IS
  'Si el ping viene del carrito bar (no de un jugador/caddie), apunta al venue tipo cart correspondiente.';
