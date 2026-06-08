/**
 * /fb-mesero — vista del MESERO del restaurante.
 *
 * Grid de mesas de los venues asignados al usuario (o todos los restaurantes
 * si es admin). Cada mesa muestra estado (libre/abierta/pidiendo), total
 * acumulado y antigüedad. Tocar una mesa lleva a /fb-mesero/[tableCode].
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { resolveFbScope } from "@/lib/fb/userScope";
import { loadVenueTables, type TableWithState } from "@/lib/fb/loadTables";
import MeseroGrid from "./MeseroGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface VenueWithTables {
  id: string;
  code: string;
  name: string;
  tables: TableWithState[];
}

export default async function FbMeseroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/fb-mesero");

  const admin = createAdminClient();
  const userRoles = await getUserRoles(admin, user.id);
  const scope = await resolveFbScope(admin, user.id, userRoles);

  // Venues que son restaurante (no carritos) y que el usuario puede operar.
  let venueQ = admin
    .from("fb_venues")
    .select("id, code, name, type")
    .eq("is_active", true)
    .eq("type", "restaurant")
    .order("display_order", { ascending: true });
  if (scope.allowedVenueIds && scope.allowedVenueIds.length > 0) {
    venueQ = venueQ.in("id", scope.allowedVenueIds);
  } else if (scope.allowedVenueIds && scope.allowedVenueIds.length === 0) {
    return (
      <EmptyState reason="Sin permisos sobre ningún restaurante. Pide al comité que te agregue al venue desde /fb-admin → permisos por venue." />
    );
  }
  const { data: venuesRaw } = await venueQ;
  const venues = (venuesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string;
    type: string;
  }>;

  if (venues.length === 0) {
    return <EmptyState reason="No hay restaurantes activos en fb_venues." />;
  }

  const venuesWithTables: VenueWithTables[] = [];
  for (const v of venues) {
    const tables = await loadVenueTables(admin, v.id);
    venuesWithTables.push({
      id: v.id,
      code: v.code,
      name: v.name,
      tables,
    });
  }

  return <MeseroGrid venues={venuesWithTables} />;
}

function EmptyState({ reason }: { reason: string }) {
  return (
    <div className="min-h-screen bg-slate-100 p-6">
      <div className="mx-auto max-w-md rounded-lg bg-white p-6 shadow ring-1 ring-slate-200">
        <h1 className="text-lg font-bold text-slate-900">Mesero · Restaurante</h1>
        <p className="mt-2 text-sm text-slate-600">{reason}</p>
        <Link
          href="/inicio"
          className="mt-4 inline-block text-sm font-semibold text-indigo-600 underline"
        >
          ← Volver
        </Link>
      </div>
    </div>
  );
}
