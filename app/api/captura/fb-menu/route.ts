/**
 * GET /api/captura/fb-menu
 *
 * Devuelve el menú filtrado por venue (opcional) para la vista cliente
 * de la Mini App. Solo items activos. Agrupado por categoría.
 *
 * Query params:
 *   ?venue_id=uuid     opcional, filtra items disponibles en ese venue
 *   ?venue_code=str    alternativa, busca venue por code (h6/cart_front/...)
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  groupMenuByCategory,
  listCategories,
  listMenuItems,
  listVenues,
} from "@/lib/fb/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venueIdParam = url.searchParams.get("venue_id")?.trim() || null;
  const venueCodeParam = url.searchParams.get("venue_code")?.trim() || null;

  const admin = createAdminClient();
  const [venues, categories, items] = await Promise.all([
    listVenues(admin, { onlyActive: true }),
    listCategories(admin, { onlyActive: true }),
    listMenuItems(admin, { onlyActive: true }),
  ]);

  // Resolver venue_id desde code si vino así
  let venueId = venueIdParam;
  if (!venueId && venueCodeParam) {
    const v = venues.find((x) => x.code === venueCodeParam);
    venueId = v?.id ?? null;
  }

  const filteredItems = venueId
    ? items.filter((it) => it.availableVenueIds.includes(venueId!))
    : items;

  const grouped = groupMenuByCategory(categories, filteredItems);

  return NextResponse.json({
    ok: true,
    venues,
    selectedVenueId: venueId,
    menu: grouped.map((g) => ({
      category: g.category,
      items: g.items.map((it) => ({
        id: it.id,
        name: it.name,
        description: it.description,
        priceCents: it.priceCents,
        imageUrl: it.imageUrl,
        prepMinutes: it.prepMinutes,
      })),
    })),
  });
}
