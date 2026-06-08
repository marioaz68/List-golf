-- ============================================================================
-- Seed del menú "Mucho" — Restaurante Hoyo 6 del CCQ
--
-- Idempotente: usa índice único (category_id, name) + ON CONFLICT DO NOTHING
-- para no sobreescribir cambios manuales que haga el restaurante después.
-- Si quieres regenerar todo, primero ejecuta:
--   DELETE FROM fb_menu_items WHERE name IN (...) AND category_id IN (...)
--
-- Items "PRÓXIMAMENTE" (pizzas, tacos de mar) NO se insertan — el restaurante
-- los activará desde /fb-admin cuando estén listos.
-- ============================================================================

-- Asegurar índice único para upsert idempotente
CREATE UNIQUE INDEX IF NOT EXISTS fb_menu_items_cat_name_uniq
  ON public.fb_menu_items (category_id, name);

-- ============================================================================
-- 1) Reordenar / agregar categorías al gusto del menú Mucho
-- ============================================================================
INSERT INTO public.fb_categories (code, name, display_order) VALUES
  ('aguachiles_ceviches', 'Aguachiles y ceviches',           1),
  ('entradas',            'Entradas y botanas',              2),
  ('tostadas',            'Tostadas',                        3),
  ('hamburguesas',        'De la casa',                      4),
  ('alitas',              'Alitas',                          5),
  ('pokes',               'Pokes',                           6),
  ('pastas',              'Pastas',                          7),
  ('burritos',            'Burritos',                        8),
  ('ensaladas',           'Ensaladas',                       9),
  ('desayunos_huevos',    'Desayunos · huevos al gusto',    10),
  ('desayunos_bowls',     'Desayunos · bowls y saludable',  11),
  ('desayunos_extras',    'Desayunos · otros',              12),
  ('tacos_guiso',         'Tacos de guiso',                 13),
  ('quesadillas',         'Quesadillas',                    14),
  ('sandwiches',          'Sándwiches',                     15),
  ('tortas',              'Tortas',                         16),
  ('platillos',           'Platillos fuertes',              17),
  ('postres',             'Postres',                        18),
  ('bebidas_frias',       'Bebidas frías sin alcohol',      19),
  ('cervezas',            'Cervezas',                       20),
  ('cocteles',            'Cocteles y vinos',               21),
  ('cafe',                'Café y bebidas calientes',       22)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- 2) Insertar items del menú
--    available_venue_ids = solo Hoyo 6 (restaurante).
--    El restaurante puede después extender qué items van también en carrito.
-- ============================================================================
WITH
  h6 AS (SELECT id FROM public.fb_venues WHERE code = 'h6'),
  cats AS (
    SELECT code, id FROM public.fb_categories
    WHERE code IN (
      'aguachiles_ceviches','entradas','tostadas','hamburguesas','alitas',
      'pokes','pastas','burritos','ensaladas',
      'desayunos_huevos','desayunos_bowls','desayunos_extras',
      'tacos_guiso','quesadillas','sandwiches','tortas'
    )
  )
INSERT INTO public.fb_menu_items
  (category_id, name, description, price_cents, available_venue_ids, display_order)
SELECT
  cats.id,
  m.name,
  m.description,
  m.price_cents,
  ARRAY[(SELECT id FROM h6)],
  m.display_order
FROM (VALUES
  -- ============ AGUACHILES Y CEVICHES ============
  ('aguachiles_ceviches', 'Aguachile verde',        NULL,                                                                   16000,  1),
  ('aguachiles_ceviches', 'Aguachile rojo',         NULL,                                                                   16000,  2),
  ('aguachiles_ceviches', 'Coctel de camarón',      'Con salsa coctelera tradicional',                                      19000,  3),
  ('aguachiles_ceviches', 'Ceviche mexicano',       'Con una mezcla de aceites de la casa',                                 12500,  4),
  ('aguachiles_ceviches', 'Ceviche la palapa',      'Con una mezcla de verduras y salsas negras',                           13500,  5),
  ('aguachiles_ceviches', 'Ceviche mixto',          'Pescado y camarón al estilo la palapa',                                14500,  6),

  -- ============ ENTRADAS Y BOTANAS ============
  ('entradas',            'Guacamole',              'Con totopos y semillas de calabaza',                                   11000,  1),
  ('entradas',            'Tartar de atún',         'Plato fresco y sofisticado',                                           18000,  2),
  ('entradas',            'Carpaccio de salmón',    'Con alcaparras y hierbas finas',                                       13000,  3),
  ('entradas',            'Papas a la francesa',    'Orden',                                                                 6500,  4),
  ('entradas',            'Papas Mucho',            NULL,                                                                    8500,  5),
  ('entradas',            'Aros de cebolla',        NULL,                                                                    6500,  6),

  -- ============ TOSTADAS ============
  ('tostadas',            'Tostada de camarón cocido', NULL,                                                                 8000,  1),
  ('tostadas',            'Tostada de atún',        NULL,                                                                    9000,  2),
  ('tostadas',            'Tostada de pescado',     NULL,                                                                    8000,  3),
  ('tostadas',            'Tostada de aguachile',   NULL,                                                                    9000,  4),
  ('tostadas',            'Tostada de salmón',      NULL,                                                                    9000,  5),

  -- ============ DE LA CASA ============
  ('hamburguesas',        'Hamburguesa Palapa',     'Carne sirloin acompañada de papas',                                    12000,  1),
  ('hamburguesas',        'Pepito de arrachera',    NULL,                                                                   15000,  2),
  ('hamburguesas',        'Tacos de arrachera',     'Con tortilla de harina, jitomate y aguacate (consultar precio)',           0,  3),

  -- ============ ALITAS ============
  ('alitas',              'Orden de 5 alitas',      'Búfalo, BBQ, limón o pimienta',                                        13000,  1),

  -- ============ POKES ============
  ('pokes',               'Poke atún',              NULL,                                                                   19000,  1),
  ('pokes',               'Poke salmón',            NULL,                                                                   19000,  2),
  ('pokes',               'Poke camarón',           NULL,                                                                   18000,  3),
  ('pokes',               'Poke vegetariano',       NULL,                                                                   16500,  4),

  -- ============ PASTAS ============
  ('pastas',              'Pasta boloñesa',         NULL,                                                                   12000,  1),
  ('pastas',              'Pasta alfredo',          NULL,                                                                   11000,  2),
  ('pastas',              'Pasta al burro',         NULL,                                                                   10000,  3),
  ('pastas',              'Extra pollo (pasta)',    'Acompañamiento adicional para pasta',                                   3000, 10),
  ('pastas',              'Extra tocino (pasta)',   'Acompañamiento adicional para pasta',                                   3500, 11),
  ('pastas',              'Extra camarón (pasta)',  'Acompañamiento adicional para pasta',                                   3500, 12),

  -- ============ BURRITOS ============
  ('burritos',            'Burrito de arrachera',   NULL,                                                                   13000,  1),
  ('burritos',            'Burrito de pollo',       NULL,                                                                   12000,  2),

  -- ============ ENSALADAS ============
  ('ensaladas',           'Ensalada de la casa',    'Mix de lechugas con queso de cabra',                                   12500,  1),
  ('ensaladas',           'Ensalada de atún',       'Con tomate, aguacate y cebolla',                                        9500,  2),

  -- ============ DESAYUNOS · HUEVOS AL GUSTO ============
  ('desayunos_huevos',    'Huevos revueltos',       NULL,                                                                    8500,  1),
  ('desayunos_huevos',    'Huevos estrellados',     NULL,                                                                    9000,  2),
  ('desayunos_huevos',    'Huevos rancheros',       NULL,                                                                   10000,  3),
  ('desayunos_huevos',    'Huevos divorciados',     NULL,                                                                   10000,  4),
  ('desayunos_huevos',    'Huevos a la mexicana',   NULL,                                                                    9500,  5),
  ('desayunos_huevos',    'Huevos con jamón',       NULL,                                                                    9500,  6),
  ('desayunos_huevos',    'Huevos con salchicha',   NULL,                                                                    9500,  7),
  ('desayunos_huevos',    'Huevos con chorizo',     NULL,                                                                    9500,  8),
  ('desayunos_huevos',    'Huevos cocidos',         NULL,                                                                    1500,  9),
  ('desayunos_huevos',    'Omelette jamón y queso', NULL,                                                                   10000, 10),
  ('desayunos_huevos',    'Omelette con verdura y queso', NULL,                                                              11500, 11),
  ('desayunos_huevos',    'Omelette con espinaca y tocino', NULL,                                                            13000, 12),

  -- ============ DESAYUNOS · BOWLS Y SALUDABLE ============
  ('desayunos_bowls',     'Bowl de frutas de temporada', NULL,                                                                6000,  1),
  ('desayunos_bowls',     'Acai bowl',              'Acompañado con fruta de temporada y granola',                           9500,  2),
  ('desayunos_bowls',     'Bowl de avena',          'Acompañado con fruta de temporada',                                     7500,  3),
  ('desayunos_bowls',     'Parfait clásico',        NULL,                                                                    6500,  4),
  ('desayunos_bowls',     'Avocado toast',          NULL,                                                                    9000,  5),
  ('desayunos_bowls',     'Salmón toast',           NULL,                                                                   11000,  6),

  -- ============ DESAYUNOS · OTROS ============
  ('desayunos_extras',    'Chilaquiles rojos o verdes', 'Con queso, crema y frijoles refritos',                              9500,  1),
  ('desayunos_extras',    'Extra huevo (chilaquiles)', 'Estrellado o revuelto',                                              2500, 10),
  ('desayunos_extras',    'Extra pechuga de pollo (chilaquiles)', NULL,                                                      2500, 11),
  ('desayunos_extras',    'Extra arrachera (chilaquiles)', NULL,                                                             5500, 12),
  ('desayunos_extras',    'Extra copete (chilaquiles)', NULL,                                                                4500, 13),
  ('desayunos_extras',    'Enchiladas suizas',      'Rojas o verdes, rellenas de pollo, servidas con crema',                11000,  2),
  ('desayunos_extras',    'Waffles',                NULL,                                                                    9000,  3),

  -- ============ TACOS DE GUISO ============
  ('tacos_guiso',         'Taco de copete',         NULL,                                                                    3500,  1),
  ('tacos_guiso',         'Taco de carnitas',       NULL,                                                                    3500,  2),
  ('tacos_guiso',         'Taco de milanesa',       NULL,                                                                    3500,  3),
  ('tacos_guiso',         'Taco de chile negro',    NULL,                                                                    3500,  4),
  ('tacos_guiso',         'Taco de cochinita',      NULL,                                                                    3500,  5),
  ('tacos_guiso',         'Taco de chile relleno',  NULL,                                                                    4500,  6),

  -- ============ QUESADILLAS ============
  ('quesadillas',         'Quesadilla de harina',   NULL,                                                                    4500,  1),
  ('quesadillas',         'Quesadilla de maíz',     NULL,                                                                    3000,  2),
  ('quesadillas',         'Quesadilla de harina con guiso', NULL,                                                            6000,  3),
  ('quesadillas',         'Quesadilla de maíz con guiso', NULL,                                                              4500,  4),

  -- ============ SÁNDWICHES ============
  ('sandwiches',          'Sándwich de pavo',       NULL,                                                                    8500,  1),
  ('sandwiches',          'Sándwich de atún',       NULL,                                                                    9000,  2),
  ('sandwiches',          'Club sándwich',          NULL,                                                                   10000,  3),

  -- ============ TORTAS ============
  ('tortas',              'Torta cubana',           NULL,                                                                   11000,  1),
  ('tortas',              'Torta milanesa',         NULL,                                                                    9500,  2),
  ('tortas',              'Torta huevo con chorizo', NULL,                                                                   9000,  3),
  ('tortas',              'Torta de jamón con queso', NULL,                                                                  8000,  4),
  ('tortas',              'Torta cochinita',        NULL,                                                                   10000,  5),
  ('tortas',              'Torta copete',           NULL,                                                                   11000,  6),
  ('tortas',              'Torta carnitas',         NULL,                                                                    9500,  7),
  ('tortas',              'Torta chori-queso',      NULL,                                                                    8500,  8),
  ('tortas',              'Torta huevo con jamón',  NULL,                                                                    8000,  9),
  ('tortas',              'Torta huevo con salchicha', NULL,                                                                 8000, 10),
  ('tortas',              'Torta changa',           NULL,                                                                    9500, 11)
) AS m(cat_code, name, description, price_cents, display_order)
JOIN cats ON cats.code = m.cat_code
ON CONFLICT (category_id, name) DO NOTHING;
