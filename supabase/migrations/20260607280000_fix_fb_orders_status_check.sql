-- ============================================================================
-- Fix: la migración 20260607220000 (paid) falló con "is violated by some row"
-- porque alguna fila tenía un status legacy fuera del nuevo CHECK.
--
-- Solución: usar NOT VALID para que el constraint aplique a INSERTs/UPDATEs
-- nuevos pero NO bloquee por filas existentes. Si más tarde se quiere
-- limpiar los datos, correr:
--   SELECT DISTINCT status FROM fb_orders;
-- Y luego:
--   ALTER TABLE fb_orders VALIDATE CONSTRAINT fb_orders_status_check;
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
) NOT VALID;
