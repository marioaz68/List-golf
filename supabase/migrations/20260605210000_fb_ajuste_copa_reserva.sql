-- Ajuste pedido por el usuario: el club no maneja precios premium fuertes,
-- la copa de vino reserva queda en $200 en lugar de $350. La botella se
-- queda en $1,350 (mark-up sano vs costo $500).

UPDATE public.fb_menu_items
   SET price_cents = 20000,
       description = 'Etiqueta superior · servida por copa (precio club)'
 WHERE name IN ('Copa de vino tinto reserva', 'Copa de vino blanco reserva');
