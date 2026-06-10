/**
 * Reportes del día para el dueño / manager del restaurante.
 *
 * Muestra ventas totales, pedidos por venue, top items, evolución por hora.
 * Solo visible para usuarios con scope.isOwner=true (super_admin,
 * club_admin, tournament_director, o restaurante con is_owner=true).
 */
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { createClient } from "@/utils/supabase/server";
import { getUserRoles } from "@/lib/auth/getUserRoles";
import { resolveFbScope } from "@/lib/fb/userScope";
import ReportesClient from "./ReportesClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export interface DayReport {
  date: string;
  fromDate: string;
  toDate: string;
  totalCobradoCents: number;
  totalPorCobrarCents: number;
  totalCanceladoCents: number;
  totalDisputaCents: number;
  ordersCount: number;
  uniqueClients: number;
  byVenue: VenueStats[];
  topItems: TopItem[];
  byHour: HourStat[];
}

export interface VenueStats {
  venueId: string;
  venueName: string;
  venueType: "restaurant" | "cart";
  orders: number;
  cobradoCents: number;
  porCobrarCents: number;
}

export interface TopItem {
  menuItemId: string;
  name: string;
  totalQty: number;
  totalCents: number;
}

export interface HourStat {
  hour: number;       // 0-23
  orders: number;
  totalCents: number;
}

function todayMexicoDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Mexico_City",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default async function FbReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const today = todayMexicoDate();

  // Soporta rango (from/to) y compat con el viejo ?date=. Si solo viene date,
  // el rango es ese mismo día. Si no viene nada, es el día de hoy.
  const fromDate = sp.from?.trim() || sp.date?.trim() || today;
  const toDateRaw = sp.to?.trim() || sp.date?.trim() || today;

  // Normalizar: asegurar from <= to (si los invierten, los acomodamos)
  const [startDate, endDate] =
    fromDate <= toDateRaw ? [fromDate, toDateRaw] : [toDateRaw, fromDate];
  const dateParam = startDate;

  const admin = createAdminClient();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id ?? "";
  const userRoles = userId ? await getUserRoles(admin, userId) : [];
  const scope = await resolveFbScope(admin, userId, userRoles);

  // Bloqueo: solo owner ve reportes
  if (!scope.isOwner) {
    redirect("/fb-cocina");
  }

  // Rango UTC: del inicio del primer día al fin del último día (México UTC-6)
  const startISO = new Date(`${startDate}T00:00:00-06:00`).toISOString();
  const endISO = new Date(`${endDate}T23:59:59-06:00`).toISOString();

  const { data: ordersRaw } = await admin
    .from("fb_orders")
    .select(
      "id, status, total_cents, created_at, entry_id, caddie_id, venue_id"
    )
    .gte("created_at", startISO)
    .lte("created_at", endISO);
  const orders = (ordersRaw ?? []) as Array<{
    id: string;
    status: string;
    total_cents: number;
    created_at: string;
    entry_id: string | null;
    caddie_id: string | null;
    venue_id: string;
  }>;

  // Acumular
  let totalCobradoCents = 0;
  let totalPorCobrarCents = 0;
  let totalCanceladoCents = 0;
  let totalDisputaCents = 0;
  const venueAgg = new Map<string, { orders: number; cobrado: number; porCobrar: number }>();
  const hourAgg = new Map<number, { orders: number; total: number }>();
  const clients = new Set<string>();

  for (const o of orders) {
    if (o.entry_id) clients.add(`e:${o.entry_id}`);
    else if (o.caddie_id) clients.add(`c:${o.caddie_id}`);

    const va = venueAgg.get(o.venue_id) ?? {
      orders: 0,
      cobrado: 0,
      porCobrar: 0,
    };
    va.orders += 1;
    if (o.status === "paid") va.cobrado += o.total_cents;
    else if (o.status === "delivered" || o.status === "pending_acceptance")
      va.porCobrar += o.total_cents;
    venueAgg.set(o.venue_id, va);

    const hr = new Date(o.created_at).getHours();
    const ha = hourAgg.get(hr) ?? { orders: 0, total: 0 };
    ha.orders += 1;
    ha.total += o.total_cents;
    hourAgg.set(hr, ha);

    switch (o.status) {
      case "paid":
        totalCobradoCents += o.total_cents;
        break;
      case "delivered":
      case "pending_acceptance":
        totalPorCobrarCents += o.total_cents;
        break;
      case "cancelled":
        totalCanceladoCents += o.total_cents;
        break;
      case "disputed":
        totalDisputaCents += o.total_cents;
        break;
      default:
        // pending/accepted/preparing/ready/on_the_way también suman a por cobrar futuro
        totalPorCobrarCents += o.total_cents;
        break;
    }
  }

  // Top items (de los pedidos no cancelados)
  const orderIds = orders
    .filter((o) => o.status !== "cancelled")
    .map((o) => o.id);
  const topItems: TopItem[] = [];
  if (orderIds.length > 0) {
    const { data: linesRaw } = await admin
      .from("fb_order_items")
      .select("menu_item_id, qty, unit_price_cents, item_name_snapshot")
      .in("order_id", orderIds);
    const agg = new Map<string, { name: string; qty: number; cents: number }>();
    for (const l of (linesRaw ?? []) as Array<Record<string, unknown>>) {
      const id = String(l.menu_item_id);
      const prev = agg.get(id) ?? {
        name: String(l.item_name_snapshot ?? ""),
        qty: 0,
        cents: 0,
      };
      prev.qty += Number(l.qty ?? 0);
      prev.cents += Number(l.unit_price_cents ?? 0) * Number(l.qty ?? 0);
      agg.set(id, prev);
    }
    for (const [id, v] of agg) {
      topItems.push({
        menuItemId: id,
        name: v.name,
        totalQty: v.qty,
        totalCents: v.cents,
      });
    }
    topItems.sort((a, b) => b.totalQty - a.totalQty);
  }

  // Nombres de venues
  const venueIds = Array.from(venueAgg.keys());
  const venueInfo = new Map<string, { name: string; type: string }>();
  if (venueIds.length > 0) {
    const { data: vs } = await admin
      .from("fb_venues")
      .select("id, name, type")
      .in("id", venueIds);
    for (const v of (vs ?? []) as Array<Record<string, unknown>>) {
      venueInfo.set(String(v.id), {
        name: String(v.name),
        type: String(v.type),
      });
    }
  }
  const byVenue: VenueStats[] = Array.from(venueAgg.entries())
    .map(([id, agg]) => {
      const info = venueInfo.get(id) ?? { name: "—", type: "restaurant" };
      return {
        venueId: id,
        venueName: info.name,
        venueType: info.type as "restaurant" | "cart",
        orders: agg.orders,
        cobradoCents: agg.cobrado,
        porCobrarCents: agg.porCobrar,
      };
    })
    .sort((a, b) => b.cobradoCents + b.porCobrarCents - (a.cobradoCents + a.porCobrarCents));

  const byHour: HourStat[] = Array.from(hourAgg.entries())
    .map(([h, agg]) => ({ hour: h, orders: agg.orders, totalCents: agg.total }))
    .sort((a, b) => a.hour - b.hour);

  const report: DayReport = {
    date: dateParam,
    fromDate: startDate,
    toDate: endDate,
    totalCobradoCents,
    totalPorCobrarCents,
    totalCanceladoCents,
    totalDisputaCents,
    ordersCount: orders.length,
    uniqueClients: clients.size,
    byVenue,
    topItems: topItems.slice(0, 15),
    byHour,
  };

  return <ReportesClient report={report} />;
}
