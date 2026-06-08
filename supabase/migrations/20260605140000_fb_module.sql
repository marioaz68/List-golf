-- ============================================================================
-- Módulo F&B (Food & Beverage) — List.Golf
--
-- Permite a jugadores y caddies pedir comida/bebida desde la Mini App,
-- coordinar la preparación en el restaurante del Hoyo 6 (halfway) y la
-- entrega a través de carritos bar usando el GPS del cliente.
--
-- Venues: restaurante (Hoyo 6) + carritos bar configurables (típicamente
-- uno para hoyos 1-9 y otro para 10-18, pero se pueden agregar más).
--
-- Todos los precios se guardan en CENTAVOS (integer) para evitar errores
-- de redondeo de floats. La UI los muestra dividido entre 100.
-- ============================================================================

-- =========================
-- VENUES (restaurante + carritos bar)
-- =========================
CREATE TABLE IF NOT EXISTS public.fb_venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,         -- 'h6', 'cart_front', 'cart_back'
  name text NOT NULL,                -- 'Restaurante Hoyo 6', 'Carrito Bar Front 9'
  type text NOT NULL CHECK (type IN ('restaurant', 'cart')),
  hole_range_start int NULL,         -- carrito que cubre del hoyo X al Y
  hole_range_end int NULL,
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_venues_active_idx
  ON public.fb_venues (is_active, display_order)
  WHERE is_active = true;

-- =========================
-- CATEGORÍAS del menú (entradas, hamburguesas, bebidas, etc.)
-- =========================
CREATE TABLE IF NOT EXISTS public.fb_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  display_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =========================
-- ITEMS del menú
-- =========================
CREATE TABLE IF NOT EXISTS public.fb_menu_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.fb_categories (id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text NULL,
  price_cents int NOT NULL CHECK (price_cents >= 0),
  image_url text NULL,
  -- En qué venues se puede pedir este item (array de fb_venues.id).
  -- Permite tener items que solo sirve el restaurante (entrada de mesa) y
  -- otros que también lleva el carrito (cervezas, papas).
  available_venue_ids uuid[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  display_order int NOT NULL DEFAULT 0,
  prep_minutes int NULL,
  allergens text[] NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_menu_items_category_idx
  ON public.fb_menu_items (category_id, display_order)
  WHERE is_active = true;

-- =========================
-- ORDERS (pedidos)
-- =========================
CREATE TABLE IF NOT EXISTS public.fb_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NULL REFERENCES public.tournaments (id) ON DELETE SET NULL,
  -- Identificación del cliente: entry_id si es jugador del torneo,
  -- caddie_id si es caddie. Al menos uno debe estar lleno.
  entry_id uuid NULL REFERENCES public.tournament_entries (id) ON DELETE SET NULL,
  caddie_id uuid NULL REFERENCES public.caddies (id) ON DELETE SET NULL,
  client_label text NULL,             -- nombre legible snapshoteado al pedir
  venue_id uuid NOT NULL REFERENCES public.fb_venues (id) ON DELETE RESTRICT,
  delivery_type text NOT NULL CHECK (delivery_type IN ('pickup', 'on_course')),
  -- 'pickup' = recoge en el venue (Hoyo 6)
  -- 'on_course' = el carrito lleva al hoyo donde está el cliente
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- recién creado, espera aceptación
    'accepted',    -- restaurante/carrito aceptó
    'preparing',   -- en cocina
    'ready',       -- listo (en pickup, esperando que pase; en cart, esperando que el carrito lo recoja)
    'on_the_way',  -- carrito en camino al cliente
    'delivered',   -- entregado, cuenta cobrada
    'cancelled'    -- cancelado por cliente o por restaurante
  )),
  requested_hole int NULL,             -- hoyo donde quiere la entrega (on_course)
  current_hole_at_order int NULL,      -- hoyo del cliente al momento del pedido (snapshot)
  total_cents int NOT NULL DEFAULT 0,
  notes text NULL,                     -- "sin cebolla", "para 4 personas", etc.
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz NULL,
  ready_at timestamptz NULL,
  delivered_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  cancelled_reason text NULL,
  CONSTRAINT fb_orders_has_client CHECK (
    entry_id IS NOT NULL OR caddie_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS fb_orders_venue_status_idx
  ON public.fb_orders (venue_id, status, created_at DESC)
  WHERE status NOT IN ('delivered', 'cancelled');

CREATE INDEX IF NOT EXISTS fb_orders_client_idx
  ON public.fb_orders (entry_id, created_at DESC)
  WHERE entry_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fb_orders_caddie_idx
  ON public.fb_orders (caddie_id, created_at DESC)
  WHERE caddie_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS fb_orders_tournament_idx
  ON public.fb_orders (tournament_id, created_at DESC)
  WHERE tournament_id IS NOT NULL;

-- =========================
-- ORDER ITEMS (líneas del pedido)
-- =========================
CREATE TABLE IF NOT EXISTS public.fb_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.fb_orders (id) ON DELETE CASCADE,
  menu_item_id uuid NOT NULL REFERENCES public.fb_menu_items (id) ON DELETE RESTRICT,
  qty int NOT NULL DEFAULT 1 CHECK (qty > 0),
  unit_price_cents int NOT NULL CHECK (unit_price_cents >= 0),
  -- Snapshot del nombre por si el restaurante lo cambia después.
  item_name_snapshot text NOT NULL,
  notes text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fb_order_items_order_idx
  ON public.fb_order_items (order_id);

-- =========================
-- TRIGGERS para updated_at
-- =========================
CREATE OR REPLACE FUNCTION public.fb_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fb_venues_touch ON public.fb_venues;
CREATE TRIGGER fb_venues_touch BEFORE UPDATE ON public.fb_venues
  FOR EACH ROW EXECUTE FUNCTION public.fb_touch_updated_at();

DROP TRIGGER IF EXISTS fb_menu_items_touch ON public.fb_menu_items;
CREATE TRIGGER fb_menu_items_touch BEFORE UPDATE ON public.fb_menu_items
  FOR EACH ROW EXECUTE FUNCTION public.fb_touch_updated_at();

-- =========================
-- RLS (todo manejado por service_role desde el backend)
-- =========================
ALTER TABLE public.fb_venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fb_order_items ENABLE ROW LEVEL SECURITY;

-- Lectura pública del menú activo y de los venues activos (para que la Mini
-- App pueda mostrarlos sin auth especial — los precios no son secretos).
CREATE POLICY fb_venues_read_active ON public.fb_venues
  FOR SELECT USING (is_active = true);

CREATE POLICY fb_categories_read_active ON public.fb_categories
  FOR SELECT USING (is_active = true);

CREATE POLICY fb_menu_items_read_active ON public.fb_menu_items
  FOR SELECT USING (is_active = true);

-- Orders / order_items: solo service_role (sin policies = bloqueado para anon)

-- =========================
-- SEED inicial: venues por defecto del CCQ
-- =========================
INSERT INTO public.fb_venues (code, name, type, hole_range_start, hole_range_end, display_order)
VALUES
  ('h6', 'Restaurante Hoyo 6', 'restaurant', NULL, NULL, 1),
  ('cart_front', 'Carrito Bar Front 9', 'cart', 1, 9, 2),
  ('cart_back', 'Carrito Bar Back 9', 'cart', 10, 18, 3)
ON CONFLICT (code) DO NOTHING;

-- Categorías base (el restaurante puede editar después)
INSERT INTO public.fb_categories (code, name, display_order)
VALUES
  ('entradas', 'Entradas y botanas', 1),
  ('hamburguesas', 'Hamburguesas', 2),
  ('sandwiches', 'Sándwiches', 3),
  ('ensaladas', 'Ensaladas', 4),
  ('platillos', 'Platillos fuertes', 5),
  ('postres', 'Postres', 6),
  ('bebidas_frias', 'Bebidas frías sin alcohol', 7),
  ('cervezas', 'Cervezas', 8),
  ('cocteles', 'Cocteles y vinos', 9),
  ('cafe', 'Café y bebidas calientes', 10)
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE public.fb_venues IS
  'Puntos de venta de F&B del club: restaurante Hoyo 6 (halfway) + carritos bar configurables por rango de hoyos.';
COMMENT ON TABLE public.fb_menu_items IS
  'Catálogo del menú. available_venue_ids define en qué venues se puede pedir cada item (un café probablemente solo en restaurante; una cerveza también en carrito).';
COMMENT ON TABLE public.fb_orders IS
  'Pedidos del cliente. delivery_type=pickup recoge en Hoyo 6; on_course el carrito busca al cliente con el GPS (requested_hole = hoyo donde lo quiere; current_hole_at_order = hoyo del cliente al pedir, snapshot).';
