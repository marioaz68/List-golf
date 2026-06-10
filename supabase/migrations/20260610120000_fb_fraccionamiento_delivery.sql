-- ============================================================================
-- F&B — Carrito de reparto al fraccionamiento (entregas a domicilio)
--
-- Para pedidos "para llevar" de socios/residentes que NO están en el campo:
-- se crea un nuevo venue tipo carrito ("Reparto Fraccionamiento") que en
-- lugar de hoyo usa un DOMICILIO dentro del fraccionamiento.
--
-- Cambios:
--   1. Nuevo venue 'cart_fracc' (type='cart', sin rango de hoyos).
--   2. delivery_type acepta 'home' (entrega a domicilio en el fraccionamiento).
--   3. fb_orders.delivery_address (texto libre: calle, número/lote, referencias).
--   4. fb_orders.player_id — el socio puede pedir aunque no tenga entry de
--      torneo activo; se identifica por su jugador (vinculado a Telegram).
--   5. El menú del restaurante (h6) también queda disponible en cart_fracc.
-- ============================================================================

-- 1. Nuevo venue de reparto al fraccionamiento
INSERT INTO public.fb_venues (code, name, type, hole_range_start, hole_range_end, display_order, notes)
VALUES
  ('cart_fracc', 'Fraccionamiento', 'cart', NULL, NULL, 4,
   'Carrito de entregas a domicilio dentro del fraccionamiento. Usa domicilio en vez de hoyo.')
ON CONFLICT (code) DO NOTHING;

-- 2. delivery_type acepta 'home'
ALTER TABLE public.fb_orders DROP CONSTRAINT IF EXISTS fb_orders_delivery_type_check;
ALTER TABLE public.fb_orders ADD CONSTRAINT fb_orders_delivery_type_check
  CHECK (delivery_type IN ('pickup', 'on_course', 'dine_in', 'home')) NOT VALID;

-- 3. Domicilio de entrega (solo aplica a delivery_type='home')
ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS delivery_address text NULL;

-- 4. Identificación por jugador/socio (sin necesidad de entry de torneo)
ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS player_id uuid NULL
  REFERENCES public.players (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fb_orders_player_idx
  ON public.fb_orders (player_id, created_at DESC)
  WHERE player_id IS NOT NULL;

-- El cliente puede ser jugador (entry), caddie, mesa, o socio (player_id).
ALTER TABLE public.fb_orders
  DROP CONSTRAINT IF EXISTS fb_orders_has_client;
ALTER TABLE public.fb_orders
  ADD CONSTRAINT fb_orders_has_client CHECK (
    entry_id IS NOT NULL
    OR caddie_id IS NOT NULL
    OR table_id IS NOT NULL
    OR player_id IS NOT NULL
  ) NOT VALID;

-- 5. Hacer disponible el menú del restaurante (h6) también en el carrito de
--    reparto al fraccionamiento, para que el socio pueda pedir todo a casa.
DO $$
DECLARE
  v_h6 uuid;
  v_fracc uuid;
BEGIN
  SELECT id INTO v_h6 FROM public.fb_venues WHERE code = 'h6';
  SELECT id INTO v_fracc FROM public.fb_venues WHERE code = 'cart_fracc';

  IF v_h6 IS NOT NULL AND v_fracc IS NOT NULL THEN
    UPDATE public.fb_menu_items
    SET available_venue_ids = array_append(available_venue_ids, v_fracc)
    WHERE v_h6 = ANY (available_venue_ids)
      AND NOT (v_fracc = ANY (available_venue_ids));
  END IF;
END $$;

COMMENT ON COLUMN public.fb_orders.delivery_address IS
  'Domicilio de entrega dentro del fraccionamiento (calle, número/lote, referencias). Solo para delivery_type=home.';
COMMENT ON COLUMN public.fb_orders.player_id IS
  'Socio/jugador que pidió (vinculado a Telegram). Permite pedidos a domicilio sin entry de torneo activo.';
