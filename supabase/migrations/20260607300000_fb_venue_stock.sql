-- ============================================================================
-- Inventario de items por venue (principalmente para carritos bar).
--
-- El restaurante Hoyo 6 normalmente NO necesita stock (cocina al momento).
-- Los carritos sí: solo cargan cierta cantidad de cada item y cuando se
-- agotan deben pedir restock o redirigir el pedido al restaurante.
--
-- Reglas:
--  - Si un item NO tiene fila aquí para un venue → stock infinito (default)
--  - Si tiene fila con qty_available > 0 → el carrito lo entrega
--  - Si qty_available = 0 → el sistema redirige al restaurante para preparar
--    y notifica al carrito cuando esté listo para que lo recoja
--
-- Cuando el carrito entrega un item, se decrementa el stock automáticamente
-- (vía trigger). Cuando lo reabastecen, el operador del carrito edita el
-- stock manualmente desde su Mini App.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fb_venue_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.fb_venues (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.fb_menu_items (id) ON DELETE CASCADE,
  qty_available int NOT NULL DEFAULT 0 CHECK (qty_available >= 0),
  /** Nivel bajo: si qty <= low_threshold, se muestra alerta amarilla. */
  low_threshold int NOT NULL DEFAULT 3,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS fb_venue_stock_uniq
  ON public.fb_venue_stock (venue_id, menu_item_id);

CREATE INDEX IF NOT EXISTS fb_venue_stock_venue_idx
  ON public.fb_venue_stock (venue_id);

ALTER TABLE public.fb_venue_stock ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.fb_venue_stock IS
  'Inventario por venue. Si no hay fila → infinito (asume cocina/restaurante). Si hay fila con qty=0 → el sistema redirige al restaurante.';

-- ============================================================================
-- Agregar columna a fb_orders para identificar pedidos REDIRIGIDOS
-- ============================================================================

ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS source_venue_id uuid NULL REFERENCES public.fb_venues (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fb_orders.source_venue_id IS
  'Venue ORIGINAL al que el cliente quiso pedir. Si != venue_id, significa que el pedido fue redirigido (típicamente porque el carrito no tenía stock y el restaurante prepara).';

-- ============================================================================
-- Nuevo status 'awaiting_cart_pickup': listo en restaurante, esperando que
-- el carrito vaya a recogerlo para llevarlo al cliente.
-- ============================================================================

ALTER TABLE public.fb_orders DROP CONSTRAINT IF EXISTS fb_orders_status_check;

ALTER TABLE public.fb_orders ADD CONSTRAINT fb_orders_status_check CHECK (
  status IN (
    'pending',
    'accepted',
    'preparing',
    'ready',
    'awaiting_cart_pickup',
    'on_the_way',
    'pending_acceptance',
    'delivered',
    'paid',
    'disputed',
    'cancelled'
  )
) NOT VALID;
