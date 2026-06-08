-- ============================================================
-- F&B: columnas para resolución de disputas por el comité
--
-- Cuando un cliente reclama un pedido (clientDisputeDelivery), el pedido pasa
-- a status='disputed'. El comité revisa desde /fb-disputas y decide:
--   - committeeApproveDispute → status='delivered' (se carga al cliente)
--   - committeeRefundDispute  → status='cancelled' (procede la queja)
--
-- En ambos casos guardamos la nota de resolución y timestamp para auditoría.
-- ============================================================

ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS dispute_resolution text NULL,
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz NULL;

COMMENT ON COLUMN public.fb_orders.dispute_resolution IS
  'Nota del comité al resolver una disputa (motivo del cargo o cancelación).';
COMMENT ON COLUMN public.fb_orders.dispute_resolved_at IS
  'Timestamp en que el comité resolvió la disputa.';

-- Índice por status='disputed' para que /fb-disputas cargue rápido
CREATE INDEX IF NOT EXISTS idx_fb_orders_disputed
  ON public.fb_orders (created_at DESC)
  WHERE status = 'disputed';
