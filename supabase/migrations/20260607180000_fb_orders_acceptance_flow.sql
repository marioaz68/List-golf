-- ============================================================================
-- Agrega status 'pending_acceptance' y 'disputed' al flujo de pedidos F&B.
--
-- Nuevo flujo (tipo Uber Eats):
--   pending → accepted → preparing → ready → (on_the_way si carrito) →
--   pending_acceptance → delivered (cliente confirmó) | disputed (cliente rechazó)
--
-- El restaurante/carrito marca el pedido como entregado pero NO se cobra
-- hasta que el cliente acepta desde su Mini App. Si rechaza, queda en
-- disputa para que el comité resuelva.
-- ============================================================================

ALTER TABLE public.fb_orders DROP CONSTRAINT IF EXISTS fb_orders_status_check;

ALTER TABLE public.fb_orders ADD CONSTRAINT fb_orders_status_check CHECK (
  status IN (
    'pending',
    'accepted',
    'preparing',
    'ready',
    'on_the_way',
    'pending_acceptance',
    'delivered',
    'disputed',
    'cancelled'
  )
);

-- Timestamps de los nuevos estados
ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS pending_acceptance_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS disputed_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS disputed_reason text NULL;

COMMENT ON COLUMN public.fb_orders.pending_acceptance_at IS
  'Cuándo el restaurante/carrito declaró el pedido entregado. El cliente debe confirmar desde la Mini App.';
COMMENT ON COLUMN public.fb_orders.disputed_at IS
  'Cuándo el cliente rechazó la entrega. Pasa a revisión del comité.';
