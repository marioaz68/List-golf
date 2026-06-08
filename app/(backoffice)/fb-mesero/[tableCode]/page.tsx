/**
 * /fb-mesero/[tableCode] — toma de pedido para una mesa específica.
 *
 * Pantalla tipo POS:
 *   - Header con número/nombre de la mesa + total acumulado
 *   - Catálogo con búsqueda y categorías (toca = agrega a la comanda)
 *   - Buffer de comanda actual (lo que el mesero va a mandar a cocina)
 *   - Lista de comandas ya enviadas (con su status)
 *   - Botón cobrar al final (propina + cuenta socio + split)
 */
import { notFound, redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { resolveFbScope } from "@/lib/fb/userScope";
import { listMenuItems, listCategories } from "@/lib/fb/queries";
import type { FbMenuItem, FbCategory } from "@/lib/fb/types";
import MesaCliente from "./MesaCliente";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Props {
  params: Promise<{ tableCode: string }>;
}

export interface MesaOrderLine {
  id: string;
  qty: number;
  name: string;
  unitPriceCents: number;
  notes: string | null;
}

export interface MesaOrder {
  id: string;
  status: string;
  totalCents: number;
  createdAt: string;
  requiresApproval: boolean;
  dinerName: string | null;
  notes: string | null;
  items: MesaOrderLine[];
}

export interface MesaSnapshot {
  table: {
    id: string;
    code: string;
    name: string | null;
    capacity: number;
    area: string;
  };
  venue: { id: string; code: string; name: string };
  orders: MesaOrder[];
  totalOpenCents: number;
  categories: FbCategory[];
  items: FbMenuItem[];
  houseAccounts: Array<{
    id: string;
    name: string;
    memberNo: string | null;
  }>;
}

export default async function FbMesaPage({ params }: Props) {
  const { tableCode } = await params;
  const decoded = decodeURIComponent(tableCode);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/fb-mesero/${tableCode}`);

  const admin = createAdminClient();
  const userRoles = await getUserRoles(admin, user.id);
  const scope = await resolveFbScope(admin, user.id, userRoles);

  // Resolver la mesa por code (puede haber varias con mismo code en distintos
  // venues; filtramos por venues permitidos al usuario)
  let tableQ = admin
    .from("fb_tables")
    .select("id, code, name, capacity, area, venue_id, is_active")
    .eq("code", decoded)
    .eq("is_active", true);
  if (scope.allowedVenueIds && scope.allowedVenueIds.length > 0) {
    tableQ = tableQ.in("venue_id", scope.allowedVenueIds);
  }
  const { data: tableRows } = await tableQ;
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

  // Cargar venue
  const { data: venueRow } = await admin
    .from("fb_venues")
    .select("id, code, name")
    .eq("id", tableRow.venue_id)
    .maybeSingle();
  if (!venueRow) return notFound();
  const venue = venueRow as { id: string; code: string; name: string };

  // Cargar órdenes abiertas + por aprobar de la mesa
  const { data: ordersRaw } = await admin
    .from("fb_orders")
    .select(
      "id, status, total_cents, created_at, requires_waiter_approval, diner_name, notes"
    )
    .eq("table_id", tableRow.id)
    .not("status", "in", "(paid,cancelled)")
    .order("created_at", { ascending: true });

  const orders = (ordersRaw ?? []) as Array<Record<string, unknown>>;
  const orderIds = orders.map((o) => String(o.id));

  // Items de cada orden
  const linesByOrder = new Map<string, MesaOrderLine[]>();
  if (orderIds.length > 0) {
    const { data: linesRaw } = await admin
      .from("fb_order_items")
      .select("id, order_id, qty, unit_price_cents, item_name_snapshot, notes")
      .in("order_id", orderIds);
    for (const l of (linesRaw ?? []) as Array<Record<string, unknown>>) {
      const oid = String(l.order_id);
      const arr = linesByOrder.get(oid) ?? [];
      arr.push({
        id: String(l.id),
        qty: Number(l.qty ?? 0),
        name: String(l.item_name_snapshot ?? ""),
        unitPriceCents: Number(l.unit_price_cents ?? 0),
        notes: l.notes ? String(l.notes) : null,
      });
      linesByOrder.set(oid, arr);
    }
  }

  const mesaOrders: MesaOrder[] = orders.map((o) => ({
    id: String(o.id),
    status: String(o.status),
    totalCents: Number(o.total_cents ?? 0),
    createdAt: String(o.created_at),
    requiresApproval: Boolean(o.requires_waiter_approval),
    dinerName: o.diner_name ? String(o.diner_name) : null,
    notes: o.notes ? String(o.notes) : null,
    items: linesByOrder.get(String(o.id)) ?? [],
  }));

  const totalOpenCents = mesaOrders.reduce((a, b) => a + b.totalCents, 0);

  // Menu del venue
  const categories = await listCategories(admin, { onlyActive: true });
  const items = await listMenuItems(admin, {
    onlyActive: true,
    venueId: venue.id,
  });

  // Cuentas de socio (para cobrar a socio)
  const { data: hsRaw } = await admin
    .from("fb_house_accounts")
    .select("id, name, member_no")
    .eq("is_active", true)
    .order("name", { ascending: true });
  const houseAccounts = ((hsRaw ?? []) as Array<Record<string, unknown>>).map(
    (h) => ({
      id: String(h.id),
      name: String(h.name),
      memberNo: h.member_no ? String(h.member_no) : null,
    })
  );

  const snapshot: MesaSnapshot = {
    table: {
      id: tableRow.id,
      code: tableRow.code,
      name: tableRow.name,
      capacity: tableRow.capacity,
      area: tableRow.area,
    },
    venue,
    orders: mesaOrders,
    totalOpenCents,
    categories,
    items,
    houseAccounts,
  };

  return <MesaCliente snapshot={snapshot} />;
}
