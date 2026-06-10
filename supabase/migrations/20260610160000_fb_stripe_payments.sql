-- ============================================================================
-- Pagos con tarjeta (Stripe) para pedidos F&B.
--
-- pending_payment: pedido creado pero aún no pagado (prepago para llevar /
-- domicilio). Al confirmar el pago en Stripe pasa a 'pending' (cocina).
-- ============================================================================

ALTER TABLE public.fb_orders DROP CONSTRAINT IF EXISTS fb_orders_status_check;

ALTER TABLE public.fb_orders ADD CONSTRAINT fb_orders_status_check CHECK (
  status IN (
    'pending_payment',
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
);

ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text NULL,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS fb_orders_stripe_session_uidx
  ON public.fb_orders (stripe_checkout_session_id)
  WHERE stripe_checkout_session_id IS NOT NULL;

COMMENT ON COLUMN public.fb_orders.stripe_checkout_session_id IS
  'ID de Stripe Checkout Session asociado al cobro de este pedido.';
COMMENT ON COLUMN public.fb_orders.stripe_payment_intent_id IS
  'ID de Stripe PaymentIntent confirmado.';
