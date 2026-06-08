import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeliveryType, OrderStatus } from "./types";

/**
 * Helper para cargar pedidos activos por venue, incluyendo:
 *  - items del pedido (líneas con nombre + cantidad)
 *  - nombre del cliente (jugador o caddie)
 *  - hoyo actual del grupo si el pedido es 'on_course' (carrito bar)
 */

export interface OrderLine {
  id: string;
  menuItemId: string;
  qty: number;
  unitPriceCents: number;
  itemNameSnapshot: string;
  notes: string | null;
}

export interface OrderForKitchen {
  id: string;
  venueId: string;
  status: OrderStatus;
  deliveryType: DeliveryType;
  totalCents: number;
  notes: string | null;
  requestedHole: number | null;
  currentHoleAtOrder: number | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  /** Quién pidió: 'Mario Pérez (jugador)' o 'Juan Caddie' */
  clientLabel: string;
  /** 'jugador' | 'caddie' | 'desconocido' — para diferenciar en la UI */
  clientKind: "player" | "caddie" | "unknown";
  /** Grupo del cliente, si lo tiene */
  groupNo: number | null;
  items: OrderLine[];
}

/** Status que consideramos "activos" en cocina (lo que cocinar/entregar). */
const ACTIVE_STATUSES: OrderStatus[] = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "on_the_way",
];

interface LoadArgs {
  venueId?: string;     // filtra por un venue específico (cocina del Hoyo 6)
  venueIds?: string[];  // o por varios (vista comité que ve todo)
  /** Si true, también devuelve 'delivered' y 'cancelled' de las últimas 4 h. */
  includeRecentCompleted?: boolean;
}

interface OrderRow {
  id: string;
  venue_id: string;
  status: string;
  delivery_type: string;
  total_cents: number;
  notes: string | null;
  requested_hole: number | null;
  current_hole_at_order: number | null;
  created_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  client_label: string | null;
  entry_id: string | null;
  caddie_id: string | null;
}

export async function loadActiveOrders(
  admin: SupabaseClient,
  args: LoadArgs = {}
): Promise<OrderForKitchen[]> {
  let q = admin
    .from("fb_orders")
    .select(
      "id, venue_id, status, delivery_type, total_cents, notes, requested_hole, current_hole_at_order, created_at, accepted_at, ready_at, client_label, entry_id, caddie_id"
    )
    .order("created_at", { ascending: true });

  if (args.venueId) q = q.eq("venue_id", args.venueId);
  else if (args.venueIds?.length) q = q.in("venue_id", args.venueIds);

  if (args.includeRecentCompleted) {
    // todos los status, pero limitar tiempo
    const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
    q = q.gte("created_at", fourHoursAgo);
  } else {
    q = q.in("status", ACTIVE_STATUSES);
  }

  const { data, error } = await q;
  if (error) {
    console.error("loadActiveOrders:", error);
    return [];
  }
  const rows = (data ?? []) as OrderRow[];
  if (rows.length === 0) return [];

  const orderIds = rows.map((r) => r.id);
  const entryIds = Array.from(new Set(rows.map((r) => r.entry_id).filter(Boolean) as string[]));
  const caddieIds = Array.from(new Set(rows.map((r) => r.caddie_id).filter(Boolean) as string[]));

  // Líneas del pedido
  const { data: linesRaw } = await admin
    .from("fb_order_items")
    .select("id, order_id, menu_item_id, qty, unit_price_cents, item_name_snapshot, notes")
    .in("order_id", orderIds);
  const linesByOrder = new Map<string, OrderLine[]>();
  for (const l of (linesRaw ?? []) as Array<Record<string, unknown>>) {
    const ol: OrderLine = {
      id: String(l.id),
      menuItemId: String(l.menu_item_id),
      qty: Number(l.qty ?? 0),
      unitPriceCents: Number(l.unit_price_cents ?? 0),
      itemNameSnapshot: String(l.item_name_snapshot ?? ""),
      notes: l.notes ? String(l.notes) : null,
    };
    const orderId = String(l.order_id);
    const arr = linesByOrder.get(orderId) ?? [];
    arr.push(ol);
    linesByOrder.set(orderId, arr);
  }

  // Datos del cliente (jugador)
  const playerNameByEntry = new Map<string, string>();
  const groupNoByEntry = new Map<string, number>();
  if (entryIds.length) {
    const { data: entries } = await admin
      .from("tournament_entries")
      .select("id, players ( first_name, last_name )")
      .in("id", entryIds);
    for (const e of (entries ?? []) as Array<Record<string, unknown>>) {
      const id = String(e.id);
      const p = e.players as
        | { first_name?: string; last_name?: string }
        | { first_name?: string; last_name?: string }[]
        | null
        | undefined;
      const player = Array.isArray(p) ? p[0] : p;
      if (player) {
        const full = [player.first_name, player.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ");
        if (full) playerNameByEntry.set(id, full);
      }
    }
    // Grupo del entry (si tiene)
    const { data: gm } = await admin
      .from("pairing_group_members")
      .select("entry_id, pairing_groups ( group_no )")
      .in("entry_id", entryIds);
    for (const row of (gm ?? []) as Array<Record<string, unknown>>) {
      const id = String(row.entry_id);
      const g = row.pairing_groups as
        | { group_no?: number }
        | { group_no?: number }[]
        | null
        | undefined;
      const grp = Array.isArray(g) ? g[0] : g;
      if (grp?.group_no != null) groupNoByEntry.set(id, Number(grp.group_no));
    }
  }

  // Datos del cliente (caddie)
  const caddieNameById = new Map<string, string>();
  if (caddieIds.length) {
    const { data: caddies } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .in("id", caddieIds);
    for (const c of (caddies ?? []) as Array<Record<string, unknown>>) {
      const id = String(c.id);
      const full = [c.first_name, c.last_name]
        .map((s) => String(s ?? "").trim())
        .filter(Boolean)
        .join(" ");
      if (full) caddieNameById.set(id, full);
    }
  }

  return rows.map((r) => {
    let clientKind: OrderForKitchen["clientKind"] = "unknown";
    let clientLabel = r.client_label ?? "";
    let groupNo: number | null = null;
    if (r.entry_id) {
      clientKind = "player";
      clientLabel =
        playerNameByEntry.get(r.entry_id) || clientLabel || "Jugador";
      groupNo = groupNoByEntry.get(r.entry_id) ?? null;
    } else if (r.caddie_id) {
      clientKind = "caddie";
      clientLabel =
        caddieNameById.get(r.caddie_id) || clientLabel || "Caddie";
    }
    return {
      id: r.id,
      venueId: r.venue_id,
      status: r.status as OrderStatus,
      deliveryType: r.delivery_type as DeliveryType,
      totalCents: r.total_cents,
      notes: r.notes,
      requestedHole: r.requested_hole,
      currentHoleAtOrder: r.current_hole_at_order,
      createdAt: r.created_at,
      acceptedAt: r.accepted_at,
      readyAt: r.ready_at,
      clientLabel,
      clientKind,
      groupNo,
      items: linesByOrder.get(r.id) ?? [],
    };
  });
}
