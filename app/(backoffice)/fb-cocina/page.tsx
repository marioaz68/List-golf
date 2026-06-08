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
import { createClient } from "@/utils/supabase/server";
import { loadActiveOrders } from "@/lib/fb/loadOrders";
import { listVenues } from "@/lib/fb/queries";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { resolveFbScope } from "@/lib/fb/userScope";
import CocinaClient from "./CocinaClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FbCocinaPage() {
  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? "";

  const userRoles = userId ? await getUserRoles(admin, userId) : [];
  const scope = await resolveFbScope(admin, userId, userRoles);

  const [allVenues, orders] = await Promise.all([
    listVenues(admin, { onlyActive: true }),
    loadActiveOrders(admin, {
      venueIds: scope.allowedVenueIds ?? undefined,
      includeRecentCompleted: true,
    }),
  ]);

  // Si el scope es restrictivo, solo mostrar esos venues en el selector
  const venues = scope.allowedVenueIds
    ? allVenues.filter((v) => scope.allowedVenueIds!.includes(v.id))
    : allVenues;

  return (
    <CocinaClient
      initialOrders={orders}
      venues={venues}
      isOwner={scope.isOwner}
    />
  );
}
