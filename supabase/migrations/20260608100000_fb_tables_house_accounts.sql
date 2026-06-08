-- ============================================================
-- F&B: módulo de RESTAURANTE (mesas, cuentas de socio, propinas).
--
-- Agrega:
--   - fb_tables           catálogo de mesas por venue (restaurante)
--   - fb_house_accounts   cuentas de socio (cargo a número de socio)
--   - fb_orders.table_id, served_by_user_id, tip_cents, house_account_id,
--     requires_waiter_approval, source_channel, diner_name
--
-- Compatibilidad: todo NULLABLE / con default, las órdenes existentes
-- (campo + Mini App) siguen funcionando sin cambios.
-- ============================================================

-- ---------- 1. fb_tables ----------
CREATE TABLE IF NOT EXISTS public.fb_tables (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id      uuid NOT NULL REFERENCES public.fb_venues(id) ON DELETE CASCADE,
  code          text NOT NULL,
  name          text NULL,
  capacity      int  NOT NULL DEFAULT 4,
  area          text NOT NULL DEFAULT 'salon',
  display_order int  NOT NULL DEFAULT 0,
  pos_x         int  NULL,
  pos_y         int  NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fb_tables_code_per_venue UNIQUE (venue_id, code)
);

CREATE INDEX IF NOT EXISTS idx_fb_tables_venue
  ON public.fb_tables (venue_id, display_order)
  WHERE is_active = true;

ALTER TABLE public.fb_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_tables read all" ON public.fb_tables;
CREATE POLICY "fb_tables read all" ON public.fb_tables
  FOR SELECT USING (true);

-- ---------- 2. fb_house_accounts ----------
CREATE TABLE IF NOT EXISTS public.fb_house_accounts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_no          text NULL,
  name               text NOT NULL,
  email              text NULL,
  phone              text NULL,
  credit_limit_cents int  NOT NULL DEFAULT 0,
  notes              text NULL,
  is_active          boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_house_accounts_active
  ON public.fb_house_accounts (name)
  WHERE is_active = true;

ALTER TABLE public.fb_house_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fb_house_accounts read all" ON public.fb_house_accounts;
CREATE POLICY "fb_house_accounts read all" ON public.fb_house_accounts
  FOR SELECT USING (true);

-- ---------- 3. fb_orders nuevas columnas ----------
ALTER TABLE public.fb_orders
  ADD COLUMN IF NOT EXISTS table_id                  uuid NULL REFERENCES public.fb_tables(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS served_by_user_id         uuid NULL,
  ADD COLUMN IF NOT EXISTS tip_cents                 int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS house_account_id          uuid NULL REFERENCES public.fb_house_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requires_waiter_approval  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_channel            text NULL,
  ADD COLUMN IF NOT EXISTS diner_name                text NULL,
  ADD COLUMN IF NOT EXISTS split_count               int  NULL;

COMMENT ON COLUMN public.fb_orders.table_id IS
  'Mesa del restaurante donde se sirvió. NULL para pedidos del campo / Mini App.';
COMMENT ON COLUMN public.fb_orders.served_by_user_id IS
  'Usuario (mesero) que tomó el pedido en mesa.';
COMMENT ON COLUMN public.fb_orders.tip_cents IS
  'Propina añadida al cobrar la cuenta de mesa.';
COMMENT ON COLUMN public.fb_orders.house_account_id IS
  'Si el cobro se carga a una cuenta de socio.';
COMMENT ON COLUMN public.fb_orders.requires_waiter_approval IS
  'Pedidos creados desde QR de mesa que esperan aprobación del mesero.';
COMMENT ON COLUMN public.fb_orders.source_channel IS
  'app | mesero | qr_table — útil para reportes.';
COMMENT ON COLUMN public.fb_orders.diner_name IS
  'Nombre que escribió el comensal en el QR (cuando no es socio).';
COMMENT ON COLUMN public.fb_orders.split_count IS
  'Si la cuenta se dividió entre N personas (solo display, no cambia totales).';

-- Permitir 'dine_in' en delivery_type. Recrear el constraint con NOT VALID
-- para no fallar si hay órdenes viejas con valores no contemplados.
ALTER TABLE public.fb_orders DROP CONSTRAINT IF EXISTS fb_orders_delivery_type_check;
ALTER TABLE public.fb_orders ADD CONSTRAINT fb_orders_delivery_type_check
  CHECK (delivery_type IN ('pickup', 'on_course', 'dine_in')) NOT VALID;

CREATE INDEX IF NOT EXISTS idx_fb_orders_table
  ON public.fb_orders (table_id)
  WHERE table_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fb_orders_pending_qr
  ON public.fb_orders (table_id)
  WHERE requires_waiter_approval = true;

-- ---------- 4. Seed inicial de mesas para el restaurante h6 ----------
-- Solo si el venue 'h6' existe y todavía no tiene mesas.
DO $$
DECLARE
  v_id uuid;
  v_count int;
BEGIN
  SELECT id INTO v_id FROM public.fb_venues WHERE code = 'h6' LIMIT 1;
  IF v_id IS NULL THEN
    RAISE NOTICE 'venue h6 no existe; salto seed de mesas';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_count FROM public.fb_tables WHERE venue_id = v_id;
  IF v_count > 0 THEN
    RAISE NOTICE 'Ya hay % mesas en h6; salto seed', v_count;
    RETURN;
  END IF;

  -- 10 mesas de salón + 2 de terraza + 2 de barra
  INSERT INTO public.fb_tables (venue_id, code, name, capacity, area, display_order) VALUES
    (v_id, 'M1',  'Mesa 1',  4, 'salon',   1),
    (v_id, 'M2',  'Mesa 2',  4, 'salon',   2),
    (v_id, 'M3',  'Mesa 3',  4, 'salon',   3),
    (v_id, 'M4',  'Mesa 4',  4, 'salon',   4),
    (v_id, 'M5',  'Mesa 5',  6, 'salon',   5),
    (v_id, 'M6',  'Mesa 6',  6, 'salon',   6),
    (v_id, 'M7',  'Mesa 7',  4, 'salon',   7),
    (v_id, 'M8',  'Mesa 8',  4, 'salon',   8),
    (v_id, 'M9',  'Mesa 9',  4, 'salon',   9),
    (v_id, 'M10', 'Mesa 10', 8, 'salon',  10),
    (v_id, 'T1',  'Terraza 1', 4, 'terraza', 11),
    (v_id, 'T2',  'Terraza 2', 6, 'terraza', 12),
    (v_id, 'B1',  'Barra 1',  2, 'barra',  13),
    (v_id, 'B2',  'Barra 2',  2, 'barra',  14);
END $$;
