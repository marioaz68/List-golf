-- ============================================================
-- Permitir órdenes F&B que solo tienen table_id (sin entry/caddie).
--
-- El constraint original exigía entry_id O caddie_id para evitar pedidos
-- huérfanos. Con el módulo de mesa también valen las órdenes con table_id
-- (mesero o QR de mesa).
-- ============================================================

ALTER TABLE public.fb_orders
  DROP CONSTRAINT IF EXISTS fb_orders_has_client;

ALTER TABLE public.fb_orders
  ADD CONSTRAINT fb_orders_has_client CHECK (
    entry_id IS NOT NULL OR caddie_id IS NOT NULL OR table_id IS NOT NULL
  ) NOT VALID;
