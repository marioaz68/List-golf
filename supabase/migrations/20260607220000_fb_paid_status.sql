-- ============================================================================
-- Status 'paid' para pedidos F&B — se marca cuando el restaurante recibe
-- el pago físico del cliente (efectivo o tarjeta en el Hoyo 6 al terminar
-- la ronda). Este es el cierre definitivo del pedido.
--
-- Flujo final:
--   pending → accepted → preparing → ready → (on_the_way) →
--   pending_acceptance → delivered (cliente confirmó) → PAID (cobrado)
--
-- Mientras esté en 'delivered', el pedido sigue en la "cuenta abierta"
-- del cliente. Al pasar a 'paid', sale de la cuenta abierta y entra al
-- histórico cerrado.
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
    'paid',
    'disputed',
    'cancelled'
  )
);

ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS paid_method text NULL,
  ADD COLUMN IF NOT EXISTS paid_notes text NULL;

COMMENT ON COLUMN public.fb_orders.paid_at IS
  'Cuándo el restaurante marcó el pedido como cobrado (pago físico recibido).';
COMMENT ON COLUMN public.fb_orders.paid_method IS
  'Cómo pagó: efectivo, tarjeta, cargo a cuenta socio, etc.';

CREATE INDEX IF NOT EXISTS fb_orders_unpaid_idx
  ON public.fb_orders (status, delivered_at)
  WHERE status = 'delivered';
