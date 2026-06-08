-- ============================================================================
-- Ajustes de precios y items adicionales del menú F&B
--
-- Cambios pedidos por el usuario después de revisar el primer seed:
--   1) Tacos de arrachera: precio definitivo $25 por pieza
--   2) Vino tinto/blanco reserva: botella cuesta $500 al restaurante
--      → venta $1,350 (mark-up x2.7) y agregar copa por separado a $350
--      (botella/4 absorbe merma + servicio)
--   3) Confirmar precio de bebidas estimadas (no se cambian, solo nota)
--
-- Idempotente: UPDATE + ON CONFLICT DO NOTHING.
-- ============================================================================

-- 1) Tacos de arrachera: $25 por pieza (carta los muestra como unidad)
UPDATE public.fb_menu_items
   SET price_cents = 2500
 WHERE name = 'Tacos de arrachera'
   AND price_cents = 0;

-- 2) Actualizar precios de botellas de vino reserva
UPDATE public.fb_menu_items
   SET price_cents = 135000,
       description = 'Etiqueta de la casa · costo aprox $500, venta $1,350 (mark-up x2.7)'
 WHERE name IN ('Botella de vino tinto reserva', 'Botella de vino blanco reserva');

-- 3) Agregar copas de vino RESERVA (diferentes de las copas de mesa que
--    ya existían a $120). La copa de reserva calculada como botella/4
--    para cubrir merma + servicio: $1,350 / 4 = $337.50 ≈ $350.
WITH
  h6 AS (SELECT id FROM public.fb_venues WHERE code = 'h6'),
  cat AS (SELECT id FROM public.fb_categories WHERE code = 'cocteles')
INSERT INTO public.fb_menu_items
  (category_id, name, description, price_cents, available_venue_ids, display_order)
SELECT
  (SELECT id FROM cat),
  v.name,
  v.description,
  v.price_cents,
  ARRAY[(SELECT id FROM h6)],
  v.display_order
FROM (VALUES
  ('Copa de vino tinto reserva',
   'Etiqueta superior · servida por copa (4 copas por botella)',
   35000, 34),
  ('Copa de vino blanco reserva',
   'Etiqueta superior · servida por copa (4 copas por botella)',
   35000, 35)
) AS v(name, description, price_cents, display_order)
ON CONFLICT (category_id, name) DO NOTHING;
