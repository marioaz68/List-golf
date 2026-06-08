/**
 * Vista de cuentas abiertas del módulo F&B.
 *
 * Para el restaurante: lista de todos los clientes con cuentas pendientes
 * (pedidos 'delivered' que el cliente ya recibió pero todavía no ha pagado
 * físicamente). Cuando el cliente paga, restaurant marca "Pagado" y se
 * cierra la cuenta.
 *
 * Muestra: cliente, total adeudado, número de pedidos, expand para ver
 * detalle pedido por pedido.
 */
import { createAdminClient } from "@/utils/supabase/admin";
import CuentasClient from "./CuentasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface ClientAccount {
  key: string;                   // "e:UUID" o "c:UUID"
  kind: "player" | "caddie";
  name: string;
  groupNo: number | null;
  tournamentId: string | null;
  openTotalCents: number;        // delivered (por cobrar)
  paidTotalCents: number;        // ya cobrados
  openOrders: AccountOrder[];
  paidOrders: AccountOrder[];
}

interface AccountOrder {
  id: string;
  totalCents: number;
  createdAt: string;
  deliveredAt: string | null;
  paidAt: string | null;
  items: { id: string; qty: number; name: string }[];
  venueName: string;
}

interface RawOrder {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  delivered_at: string | null;
  paid_at: string | null;
  entry_id: string | null;
  caddie_id: string | null;
  client_label: string | null;
  tournament_id: string | null;
  venue_id: string;
}

export default async function FbCuentasPage() {
  const admin = createAdminClient();

  // Pedidos relevantes: delivered (cuenta abierta) y paid (histórico reciente)
  const { data: ordersRaw } = await admin
    .from("fb_orders")
    .select(
      "id, status, total_cents, created_at, delivered_at, paid_at, entry_id, caddie_id, client_label, tournament_id, venue_id"
    )
    .in("status", ["delivered", "paid"])
    .order("delivered_at", { ascending: false });

  const orders = (ordersRaw ?? []) as RawOrder[];
  const orderIds = orders.map((o) => o.id);

  const linesByOrder = new Map<
    string,
    { id: string; qty: number; name: string }[]
  >();
  if (orderIds.length > 0) {
    const { data: linesRaw } = await admin
      .from("fb_order_items")
      .select("id, order_id, qty, item_name_snapshot")
      .in("order_id", orderIds);
    for (const l of (linesRaw ?? []) as Array<Record<string, unknown>>) {
      const oid = String(l.order_id);
      const arr = linesByOrder.get(oid) ?? [];
      arr.push({
        id: String(l.id),
        qty: Number(l.qty ?? 0),
        name: String(l.item_name_snapshot ?? ""),
      });
      linesByOrder.set(oid, arr);
    }
  }

  // Nombres de venues
  const venueIds = Array.from(new Set(orders.map((o) => o.venue_id)));
  const venueNameById = new Map<string, string>();
  if (venueIds.length > 0) {
    const { data: vs } = await admin
      .from("fb_venues")
      .select("id, name")
      .in("id", venueIds);
    for (const v of (vs ?? []) as Array<Record<string, unknown>>) {
      venueNameById.set(String(v.id), String(v.name));
    }
  }

  // Nombres de clientes (jugadores y caddies)
  const entryIds = Array.from(
    new Set(orders.map((o) => o.entry_id).filter(Boolean) as string[])
  );
  const caddieIds = Array.from(
    new Set(orders.map((o) => o.caddie_id).filter(Boolean) as string[])
  );
  const playerNameByEntry = new Map<string, string>();
  const groupNoByEntry = new Map<string, number>();
  if (entryIds.length > 0) {
    const { data: entries } = await admin
      .from("tournament_entries")
      .select("id, players ( first_name, last_name )")
      .in("id", entryIds);
    for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
      const id = String(e.id);
      const p = e.players as
        | { first_name?: string; last_name?: string }
        | { first_name?: string; last_name?: string }[]
        | null;
      const player = Array.isArray(p) ? p[0] : p;
      if (player) {
        const full = [player.first_name, player.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ");
        if (full) playerNameByEntry.set(id, full);
      }
    }
    const { data: gm } = await admin
      .from("pairing_group_members")
      .select("entry_id, pairing_groups ( group_no )")
      .in("entry_id", entryIds);
    for (const row of (gm ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.entry_id);
      const g = row.pairing_groups as
        | { group_no?: number }
        | { group_no?: number }[]
        | null;
      const grp = Array.isArray(g) ? g[0] : g;
      if (grp?.group_no != null) groupNoByEntry.set(id, Number(grp.group_no));
    }
  }
  const caddieNameById = new Map<string, string>();
  if (caddieIds.length > 0) {
    const { data: cs } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .in("id", caddieIds);
    for (const c of (cs ?? []) as Array<Record<string, unknown>>) {
      const full = [c.first_name, c.last_name]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" ");
      if (full) caddieNameById.set(String(c.id), full);
    }
  }

  // Agrupar por cliente
  const byClient = new Map<string, ClientAccount>();
  for (const o of orders) {
    let key: string;
    let kind: "player" | "caddie";
    let name: string;
    let groupNo: number | null = null;
    if (o.entry_id) {
      key = `e:${o.entry_id}`;
      kind = "player";
      name = playerNameByEntry.get(o.entry_id) || o.client_label || "Jugador";
      groupNo = groupNoByEntry.get(o.entry_id) ?? null;
    } else if (o.caddie_id) {
      key = `c:${o.caddie_id}`;
      kind = "caddie";
      name = caddieNameById.get(o.caddie_id) || o.client_label || "Caddie";
    } else {
      continue;
    }
    let acct = byClient.get(key);
    if (!acct) {
      acct = {
        key,
        kind,
        name,
        groupNo,
        tournamentId: o.tournament_id,
        openTotalCents: 0,
        paidTotalCents: 0,
        openOrders: [],
        paidOrders: [],
      };
      byClient.set(key, acct);
    }
    const orderForList: AccountOrder = {
      id: o.id,
      totalCents: o.total_cents,
      createdAt: o.created_at,
      deliveredAt: o.delivered_at,
      paidAt: o.paid_at,
      items: linesByOrder.get(o.id) ?? [],
      venueName: venueNameById.get(o.venue_id) ?? "—",
    };
    if (o.status === "paid") {
      acct.paidTotalCents += o.total_cents;
      acct.paidOrders.push(orderForList);
    } else {
      acct.openTotalCents += o.total_cents;
      acct.openOrders.push(orderForList);
    }
  }

  // Ordenar: con cuenta abierta primero, luego por monto desc
  const accounts = Array.from(byClient.values()).sort((a, b) => {
    if ((b.openTotalCents > 0 ? 1 : 0) !== (a.openTotalCents > 0 ? 1 : 0)) {
      return b.openTotalCents > 0 ? 1 : -1;
    }
    return b.openTotalCents - a.openTotalCents;
  });

  return <CuentasClient accounts={accounts} />;
}

export type { ClientAccount, AccountOrder };
