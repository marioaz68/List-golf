/**
 * Backoffice del módulo F&B.
 *
 * Todo en una sola página con tabs (Venues, Categorías, Menú) para que el
 * personal del restaurante pueda editar sin saltar entre pantallas. El
 * código del cliente vive en `FbAdminClient.tsx` — esta es la carga server
 * de los datos iniciales.
 */

import { createAdminClient } from "@/utils/supabase/admin";
import {
  listCategories,
  listMenuItems,
  listVenues,
} from "@/lib/fb/queries";
import FbAdminClient from "./FbAdminClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FbAdminPage() {
  const admin = createAdminClient();
  const [venues, categories, items] = await Promise.all([
    listVenues(admin),
    listCategories(admin),
    listMenuItems(admin),
  ]);

  return (
    <FbAdminClient
      initialVenues={venues}
      initialCategories={categories}
      initialMenuItems={items}
    />
  );
}
