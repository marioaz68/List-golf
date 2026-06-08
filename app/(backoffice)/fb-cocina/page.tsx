/**
 * Vista cocina del Hoyo 6 + monitor general de pedidos F&B.
 *
 * Muestra todos los pedidos activos agrupados por status (pendiente,
 * preparando, listo, en camino) como kanban. El restaurante (rol
 * 'restaurante') y el comité los procesan tocando los botones para
 * cambiar status.
 *
 * Auto-refresh cada 10 seg para ver pedidos nuevos sin reload manual.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import { loadActiveOrders } from "@/lib/fb/loadOrders";
import { listVenues } from "@/lib/fb/queries";
import CocinaClient from "./CocinaClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FbCocinaPage() {
  const admin = createAdminClient();
  const [orders, venues] = await Promise.all([
    loadActiveOrders(admin, { includeRecentCompleted: true }),
    listVenues(admin, { onlyActive: true }),
  ]);

  return <CocinaClient initialOrders={orders} venues={venues} />;
}
