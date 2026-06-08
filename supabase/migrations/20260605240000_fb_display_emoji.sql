-- Agregar columna display_emoji a fb_menu_items.
-- Si está vacía, el frontend usa el helper automático (lib/fb/icons.ts).
-- Si tiene un emoji, ese gana (override manual desde /fb-admin/emojis).

ALTER TABLE public.fb_menu_items
  ADD COLUMN IF NOT EXISTS display_emoji TEXT NULL;

COMMENT ON COLUMN public.fb_menu_items.display_emoji IS
  'Emoji manual elegido por el restaurante. Si NULL, el cliente usa el helper iconForMenuItem() que matchea por keyword + categoría.';
