/**
 * GET /api/fb-admin/orders
 *
 * Devuelve los pedidos F&B activos (+ entregados/cancelados/disputa de las
 * últimas 4 h) para la vista cocina. Auto-llamado cada 10s desde
 * CocinaClient.
 *
 * NO requiere body. Si quieres filtrar por venue, pasa ?venue_id=uuid.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadActiveOrders } from "@/lib/fb/loadOrders";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venueId = url.searchParams.get("venue_id")?.trim() || undefined;

  const admin = createAdminClient();
  const orders = await loadActiveOrders(admin, {
    venueId,
    includeRecentCompleted: true,
  });

  return NextResponse.json({ ok: true, orders });
}
