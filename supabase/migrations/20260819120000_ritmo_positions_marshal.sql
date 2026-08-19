-- ============================================================================
-- Marshals pueden mandar su ubicación GPS desde la Mini App /captura/marshal.
--
--   - jugador  : player_id set
--   - caddie   : telegram_user_id (caddie)
--   - carrito  : fb_venue_id
--   - marshal  : profile_id set (juez de campo con rol marshal)
-- ============================================================================

ALTER TABLE public.ritmo_positions
  ADD COLUMN IF NOT EXISTS profile_id uuid NULL REFERENCES public.profiles (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ritmo_positions_marshal_idx
  ON public.ritmo_positions (tournament_id, profile_id, ts DESC)
  WHERE profile_id IS NOT NULL;

COMMENT ON COLUMN public.ritmo_positions.profile_id IS
  'Si el ping viene de un marshal (Mini App /captura/marshal), apunta al profile del juez de campo.';
