-- ============================================================================
-- Seed de BEBIDAS y SNACKS — disponibles en restaurante Hoyo 6 + carritos bar
--
-- Estrategia de disponibilidad:
--  - Refrescos, aguas, cervezas, destilados (1 oz), snacks: en los 3 venues
--    (h6 + cart_front + cart_back) porque son transportables y no requieren
--    preparación. El carrito bar los lleva en hielera.
--  - Cocteles, vinos, café caliente, té: SOLO en h6 (requieren preparación
--    en barra o son sensibles a temperatura).
--
-- Precios son ESTIMADOS de mercado de un club de golf premium en Querétaro.
-- TODOS son editables desde /fb-admin → tab Menú.
--
-- Idempotente: usa el índice único (category_id, name) creado en el seed
-- del menú Mucho. Re-ejecutar la migración no duplica.
-- ============================================================================

-- ============================================================================
-- 1) Agregar categorías nuevas (destilados, snacks)
-- ============================================================================
INSERT INTO public.fb_categories (code, name, display_order) VALUES
  ('destilados',  'Destilados (tequila, ron, vodka, whisky)', 23),
  ('snacks',      'Snacks y botanas empacadas',               24)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- 2) Items disponibles en LOS 3 VENUES (h6, cart_front, cart_back)
--    Refrescos · aguas · cervezas · destilados · snacks
-- ============================================================================
WITH
  venues_all AS (
    SELECT array_agg(id ORDER BY display_order) AS ids
    FROM public.fb_venues
    WHERE code IN ('h6', 'cart_front', 'cart_back')
  ),
  cats AS (
    SELECT code, id FROM public.fb_categories
    WHERE code IN ('bebidas_frias', 'cervezas', 'destilados', 'snacks')
  )
INSERT INTO public.fb_menu_items
  (category_id, name, description, price_cents, available_venue_ids, display_order)
SELECT
  cats.id, m.name, m.description, m.price_cents,
  (SELECT ids FROM venues_all), m.display_order
FROM (VALUES

  -- ============ BEBIDAS FRÍAS SIN ALCOHOL ============
  ('bebidas_frias', 'Coca-Cola 355 ml',                NULL,                                    5000,  1),
  ('bebidas_frias', 'Coca-Cola Zero 355 ml',           NULL,                                    5000,  2),
  ('bebidas_frias', 'Coca-Cola Light 355 ml',          NULL,                                    5000,  3),
  ('bebidas_frias', 'Sprite 355 ml',                   NULL,                                    5000,  4),
  ('bebidas_frias', 'Manzanita Sol 355 ml',            NULL,                                    5000,  5),
  ('bebidas_frias', 'Fanta naranja 355 ml',            NULL,                                    5000,  6),
  ('bebidas_frias', 'Agua mineral Topo Chico 355 ml',  NULL,                                    4500,  7),
  ('bebidas_frias', 'Agua natural 600 ml',             NULL,                                    3500,  8),
  ('bebidas_frias', 'Agua natural 1 L',                NULL,                                    5500,  9),
  ('bebidas_frias', 'Gatorade 600 ml',                 'Sabor a elegir: limón, mora azul, naranja, uva',  6500, 10),
  ('bebidas_frias', 'Powerade 600 ml',                 'Sabor a elegir',                        6500, 11),
  ('bebidas_frias', 'Té helado Lipton 600 ml',         'Limón o durazno',                       5500, 12),
  ('bebidas_frias', 'Nestea durazno 500 ml',           NULL,                                    5500, 13),
  ('bebidas_frias', 'Red Bull 250 ml',                 NULL,                                    8500, 14),
  ('bebidas_frias', 'Jugo de naranja natural',         'Recién exprimido',                      7000, 15),
  ('bebidas_frias', 'Jugo verde',                      'Apio, espinaca, manzana, jengibre',     8500, 16),
  ('bebidas_frias', 'Jugo Jumex 235 ml',               'Manzana, uva o durazno',                4000, 17),
  ('bebidas_frias', 'Limonada natural',                NULL,                                    7000, 18),
  ('bebidas_frias', 'Limonada mineral',                NULL,                                    8000, 19),
  ('bebidas_frias', 'Naranjada natural',               NULL,                                    7000, 20),
  ('bebidas_frias', 'Agua de jamaica',                 NULL,                                    5500, 21),
  ('bebidas_frias', 'Agua de horchata',                NULL,                                    5500, 22),

  -- ============ CERVEZAS ============
  ('cervezas',      'Corona',                          '355 ml',                                6000,  1),
  ('cervezas',      'Corona Light',                    '355 ml',                                6000,  2),
  ('cervezas',      'Modelo Especial',                 '355 ml',                                6500,  3),
  ('cervezas',      'Modelo Negra',                    '355 ml',                                7000,  4),
  ('cervezas',      'Pacífico',                        '355 ml',                                6000,  5),
  ('cervezas',      'Victoria',                        '355 ml',                                5500,  6),
  ('cervezas',      'XX Lager',                        '355 ml',                                6000,  7),
  ('cervezas',      'XX Ambar',                        '355 ml',                                6000,  8),
  ('cervezas',      'Tecate',                          '355 ml',                                5500,  9),
  ('cervezas',      'Heineken',                        '355 ml',                                8000, 10),
  ('cervezas',      'Stella Artois',                   '330 ml',                                9000, 11),
  ('cervezas',      'Bohemia',                         '355 ml',                                7000, 12),
  ('cervezas',      'Michelada',                       'Clamato + cerveza + chamoy + tajín',    9000, 13),
  ('cervezas',      'Chelada',                         'Limón + sal + cerveza',                 7000, 14),

  -- ============ DESTILADOS (caballito 1 oz) ============
  ('destilados',    'Tequila blanco (caballito 1 oz)',     'Casa: Centenario plata',           8000,  1),
  ('destilados',    'Tequila reposado (caballito 1 oz)',   'Casa: Centenario reposado',        9000,  2),
  ('destilados',    'Tequila añejo (caballito 1 oz)',      'Casa: Don Julio añejo',           13000,  3),
  ('destilados',    'Tequila premium Don Julio 70',        'Caballito 1 oz',                  18000,  4),
  ('destilados',    'Tequila premium Clase Azul',          'Caballito 1 oz',                  35000,  5),
  ('destilados',    'Mezcal joven',                    'Casa',                                11000,  6),
  ('destilados',    'Mezcal añejo',                    'Selección de la casa',                15000,  7),
  ('destilados',    'Ron blanco (caballito 1 oz)',     'Casa: Bacardí blanco',                 8000, 10),
  ('destilados',    'Ron añejo (caballito 1 oz)',      'Casa: Bacardí 8 años',                12000, 11),
  ('destilados',    'Vodka (caballito 1 oz)',          'Casa: Absolut',                        9000, 12),
  ('destilados',    'Vodka premium Grey Goose',        'Caballito 1 oz',                      15000, 13),
  ('destilados',    'Vodka premium Belvedere',         'Caballito 1 oz',                      15000, 14),
  ('destilados',    'Ginebra (caballito 1 oz)',        'Casa: Beefeater',                     10000, 20),
  ('destilados',    'Ginebra premium Tanqueray',       'Caballito 1 oz',                      15000, 21),
  ('destilados',    'Ginebra premium Hendrick''s',     'Caballito 1 oz',                      17000, 22),
  ('destilados',    'Whisky bourbon',                  'Casa: Jim Beam',                      12000, 30),
  ('destilados',    'Whisky escocés 12 años',          'Casa: Buchanan''s 12',                 18000, 31),
  ('destilados',    'Whisky escocés 18 años',          'Casa: Chivas 18',                     25000, 32),
  ('destilados',    'Brandy Torres 10',                'Caballito 1 oz',                      11000, 40),

  -- ============ SNACKS ============
  ('snacks',        'Cacahuates japoneses 50 g',       NULL,                                    3500,  1),
  ('snacks',        'Cacahuates enchilados 50 g',      NULL,                                    3500,  2),
  ('snacks',        'Cacahuates salados 50 g',         NULL,                                    3000,  3),
  ('snacks',        'Papas Sabritas naturales (chica)', '45 g',                                 2500, 10),
  ('snacks',        'Papas Sabritas naturales (grande)', '170 g',                               6500, 11),
  ('snacks',        'Papas Ruffles queso (chica)',     '45 g',                                  2500, 12),
  ('snacks',        'Papas Ruffles queso (grande)',    '170 g',                                 6500, 13),
  ('snacks',        'Doritos nacho',                   '60 g',                                  3000, 14),
  ('snacks',        'Doritos Dinamita',                '60 g',                                  3000, 15),
  ('snacks',        'Cheetos',                         '60 g',                                  3000, 16),
  ('snacks',        'Chips de plátano',                NULL,                                    4000, 17),
  ('snacks',        'Pretzels salados',                NULL,                                    4500, 18),
  ('snacks',        'Tostitos con guacamole',          'Bolsita individual',                    5500, 19),
  ('snacks',        'Chicharrones de harina',          NULL,                                    3500, 20),
  ('snacks',        'Galletas Oreo (paquete)',         NULL,                                    3000, 30),
  ('snacks',        'Galletas Chokis',                 NULL,                                    3000, 31),
  ('snacks',        'Snickers',                        NULL,                                    3500, 32),
  ('snacks',        'KitKat',                          NULL,                                    3500, 33),
  ('snacks',        'M&M''s chocolate',                NULL,                                    5000, 34),
  ('snacks',        'M&M''s cacahuate',                NULL,                                    5000, 35),
  ('snacks',        'Barra de granola',                'Sabor a elegir',                        3500, 36)

) AS m(cat_code, name, description, price_cents, display_order)
JOIN cats ON cats.code = m.cat_code
ON CONFLICT (category_id, name) DO NOTHING;

-- ============================================================================
-- 3) Items SOLO EN RESTAURANTE (h6) — cocteles, vinos, café caliente
--    Requieren preparación en barra o son sensibles a temperatura.
-- ============================================================================
WITH
  h6 AS (SELECT id FROM public.fb_venues WHERE code = 'h6'),
  cats AS (
    SELECT code, id FROM public.fb_categories
    WHERE code IN ('cocteles', 'cafe')
  )
INSERT INTO public.fb_menu_items
  (category_id, name, description, price_cents, available_venue_ids, display_order)
SELECT
  cats.id, m.name, m.description, m.price_cents,
  ARRAY[(SELECT id FROM h6)], m.display_order
FROM (VALUES

  -- ============ COCTELES Y VINOS ============
  ('cocteles',      'Margarita clásica',               'Tequila, triple sec, limón, sal',     13000,  1),
  ('cocteles',      'Margarita de frutos rojos',       NULL,                                   14000,  2),
  ('cocteles',      'Margarita de mango',              NULL,                                   14000,  3),
  ('cocteles',      'Paloma',                          'Tequila + toronja + limón',           11000,  4),
  ('cocteles',      'Cantarito',                       'Tequila + cítricos en jarro de barro', 13000,  5),
  ('cocteles',      'Mojito',                          'Ron + hierbabuena + limón + soda',    13000,  6),
  ('cocteles',      'Cuba libre',                      'Ron + Coca-Cola',                     10000,  7),
  ('cocteles',      'Bloody Mary',                     'Vodka + jugo de tomate + especias',   13000,  8),
  ('cocteles',      'Tom Collins',                     'Ginebra + limón + soda',              12000,  9),
  ('cocteles',      'Negroni',                         'Ginebra + Campari + vermouth rojo',   15000, 10),
  ('cocteles',      'Aperol Spritz',                   'Aperol + prosecco + soda',            15000, 11),
  ('cocteles',      'Old Fashioned',                   'Bourbon + bitters + azúcar',          16000, 12),
  ('cocteles',      'Manhattan',                       'Bourbon + vermouth rojo + bitters',   16000, 13),
  ('cocteles',      'Whisky sour',                     'Whisky + limón + clara de huevo',     14000, 14),
  ('cocteles',      'Carajillo',                       'Café + licor 43',                     11000, 15),

  -- Vinos por copa
  ('cocteles',      'Copa de vino tinto (casa)',       NULL,                                   12000, 30),
  ('cocteles',      'Copa de vino blanco (casa)',      NULL,                                   12000, 31),
  ('cocteles',      'Copa de vino rosado (casa)',      NULL,                                   12000, 32),
  ('cocteles',      'Copa de espumoso',                'Prosecco o cava',                     15000, 33),

  -- Botellas
  ('cocteles',      'Botella de vino tinto reserva',   'Etiqueta de la casa',                 95000, 40),
  ('cocteles',      'Botella de vino blanco reserva',  'Etiqueta de la casa',                 95000, 41),

  -- ============ CAFÉ Y BEBIDAS CALIENTES ============
  ('cafe',          'Café americano',                  NULL,                                    4500,  1),
  ('cafe',          'Café espresso',                   NULL,                                    4000,  2),
  ('cafe',          'Café doble espresso',             NULL,                                    5500,  3),
  ('cafe',          'Café cappuccino',                 NULL,                                    5500,  4),
  ('cafe',          'Café latte',                      NULL,                                    5500,  5),
  ('cafe',          'Café mocha',                      NULL,                                    6500,  6),
  ('cafe',          'Café cortado',                    NULL,                                    5000,  7),
  ('cafe',          'Chocolate caliente',              NULL,                                    5500, 10),
  ('cafe',          'Té caliente',                     'Manzanilla, verde, negro, frutos rojos', 4000, 11),
  ('cafe',          'Té chai latte',                   NULL,                                    6000, 12),
  ('cafe',          'Leche con chocolate',             NULL,                                    5000, 13),
  ('cafe',          'Atole de la casa',                NULL,                                    5500, 14)

) AS m(cat_code, name, description, price_cents, display_order)
JOIN cats ON cats.code = m.cat_code
ON CONFLICT (category_id, name) DO NOTHING;
