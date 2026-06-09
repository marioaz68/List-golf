-- ============================================================
-- Auto-descuento de inventario al entregar pedidos.
--
-- Cuando un pedido pasa a 'delivered', el server action descuenta del
-- stock las cantidades de cada item del venue que sirvió. Para no descontar
-- dos veces (por ejemplo si el cliente confirma, luego disputa, luego se
-- reactivo), guardamos timestamp de cuándo se decrementó.
--
-- Si la orden se cancela tras delivered, devolvemos el stock e invalidamos
-- el timestamp.
-- ============================================================

ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS stock_decremented_at timestamptz NULL;

COMMENT ON COLUMN public.fb_orders.stock_decremented_at IS
  'Timestamp en que se aplicó el descuento de stock al inventario del venue. NULL = aun no se ha descontado. Permite idempotencia y reversión.';

CREATE INDEX IF NOT EXISTS idx_fb_orders_stock_undecremented
  ON public.fb_orders (status)
  WHERE stock_decremented_at IS NULL AND status IN ('delivered', 'paid');
