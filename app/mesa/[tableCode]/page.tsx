/**
 * /mesa/[tableCode] — vista PÚBLICA del comensal (sin login).
 *
 * Se accede escaneando el QR pegado en la mesa. El comensal ve el menú,
 * arma su pedido y lo manda al mesero (que lo aprueba antes de cocina).
 *
 * Sin auth — pero el pedido cae con requires_waiter_approval=true para
 * que un mesero lo valide antes de cocinarlo.
 */
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { listMenuItems, listCategories } from "@/lib/fb/queries";
import MesaComensal from "./MesaComensal";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ tableCode: string }>;
}

export default async function MesaPublicPage({ params }: Props) {
  const { tableCode } = await params;
  const decoded = decodeURIComponent(tableCode);

  const admin = createAdminClient();

  const { data: tableRows } = await admin
    .from("fb_tables")
    .select("id, code, name, capacity, area, venue_id, is_active")
    .eq("code", decoded)
    .eq("is_active", true);

  const tableRow = (tableRows ?? [])[0] as
    | {
        id: string;
        code: string;
        name: string | null;
        capacity: number;
        area: string;
        venue_id: string;
        is_active: boolean;
      }
    | undefined;
  if (!tableRow) return notFound();

  const { data: venueRow } = await admin
    .from("fb_venues")
    .select("id, name, code")
    .eq("id", tableRow.venue_id)
    .maybeSingle();
  if (!venueRow) return notFound();
  const venue = venueRow as { id: string; name: string; code: string };

  const categories = await listCategories(admin, { onlyActive: true });
  const items = await listMenuItems(admin, {
    onlyActive: true,
    venueId: venue.id,
  });

  return (
    <MesaComensal
      tableCode={tableRow.code}
      tableName={tableRow.name}
      venueName={venue.name}
      categories={categories}
      items={items}
    />
  );
}
