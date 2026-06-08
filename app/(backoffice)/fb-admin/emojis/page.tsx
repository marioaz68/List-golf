/**
 * Revisor de emojis del menú F&B.
 *
 * Vista tipo "carta de menú" donde el restaurante revisa cada item y
 * escoge entre 3 opciones:
 *  1. Emoji por categoría (default genérico, ej. 🍔 para "De la casa")
 *  2. Emoji específico (helper iconForMenuItem matchea por keyword)
 *  3. Emoji custom (input de texto, ej. el restaurante quiere 🎉)
 *
 * Si el restaurante deja el item en "específico", se queda en NULL en BD
 * y el cliente sigue usando el helper automático. Si elige cualquier
 * otra opción, se persiste en fb_menu_items.display_emoji.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import {
  listCategories,
  listMenuItems,
  listVenues,
} from "@/lib/fb/queries";
import EmojiReviewClient from "./EmojiReviewClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FbAdminEmojisPage() {
  const admin = createAdminClient();
  const [venues, categories, items] = await Promise.all([
    listVenues(admin),
    listCategories(admin),
    listMenuItems(admin),
  ]);

  return (
    <EmojiReviewClient
      venues={venues}
      categories={categories}
      items={items}
    />
  );
}
