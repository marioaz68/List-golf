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
  clientKind: "player" | "caddie" | "table" | "unknown";
  /** Grupo del cliente, si lo tiene */
  groupNo: number | null;
  /** UUID del grupo (para link al mapa /ritmo?group_id=...) */
  groupId: string | null;
  /** Ubicación EN VIVO del cliente (último ping del grupo en últimos 30 min). */
  liveLocation: {
    /** Hoyo actual detectado por GPS (modal de últimos pings). */
    currentHole: number | null;
    /** Min desde el último ping (0 = ahorita, null = sin datos). */
    lastSeenAgoMin: number | null;
    /** Min estimados para llegar al hoyo destino (pickup en restaurante o
     *  hoyo de entrega para carrito). null = no se puede calcular. */
    etaMin: number | null;
  };
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
  table_id: string | null;
  diner_name: string | null;
}

interface VenueRow {
  id: string;
  code: string;
  hole_range_start: number | null;
  hole_range_end: number | null;
  type: string;
}

export async function loadActiveOrders(
  admin: SupabaseClient,
  args: LoadArgs = {}
): Promise<OrderForKitchen[]> {
  let q = admin
    .from("fb_orders")
    .select(
      "id, venue_id, status, delivery_type, total_cents, notes, requested_hole, current_hole_at_order, created_at, accepted_at, ready_at, client_label, entry_id, caddie_id, table_id, diner_name"
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
  const tableIds = Array.from(new Set(rows.map((r) => r.table_id).filter(Boolean) as string[]));

  // Tabla → code/name para mostrar "🪑 Mesa M3" en cocina
  const tableInfoById = new Map<string, { code: string; name: string | null }>();
  if (tableIds.length) {
    const { data: tableRows } = await admin
      .from("fb_tables")
      .select("id, code, name")
      .in("id", tableIds);
    for (const t of (tableRows ?? []) as Array<Record<string, unknown>>) {
      tableInfoById.set(String(t.id), {
        code: String(t.code),
        name: t.name ? String(t.name) : null,
      });
    }
  }

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

  // Mapa de group_id por entry/caddie para ubicación en vivo
  const groupIdByEntry = new Map<string, string>();
  const groupIdByCaddie = new Map<string, string>();

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
      .select("entry_id, group_id, pairing_groups ( group_no )")
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
      if (row.group_id) groupIdByEntry.set(id, String(row.group_id));
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
    // Grupo del caddie via caddie_assignments activa
    const { data: asgs } = await admin
      .from("caddie_assignments")
      .select("caddie_id, pairing_group_id")
      .in("caddie_id", caddieIds)
      .eq("is_active", true);
    for (const a of (asgs ?? []) as Array<Record<string, unknown>>) {
      if (a.pairing_group_id) {
        groupIdByCaddie.set(String(a.caddie_id), String(a.pairing_group_id));
      }
    }
  }

  // ===== Ubicación en vivo: para cada group_id, traer últimos 10 pings =====
  const groupIds = new Set<string>();
  for (const r of rows) {
    if (r.entry_id) {
      const g = groupIdByEntry.get(r.entry_id);
      if (g) groupIds.add(g);
    } else if (r.caddie_id) {
      const g = groupIdByCaddie.get(r.caddie_id);
      if (g) groupIds.add(g);
    }
  }

  // Calcular venue → hoyo destino para ETA
  // - Restaurante (type='restaurant'): el cliente recoge, asumimos hoyo 6
  //   (el restaurante Mucho del CCQ). En futuro se puede agregar hole_no a fb_venues.
  // - Carrito: usa requested_hole del pedido (el carrito va a ese hoyo)
  const venueIds = Array.from(new Set(rows.map((r) => r.venue_id)));
  const venueMap = new Map<string, VenueRow>();
  if (venueIds.length > 0) {
    const { data: vs } = await admin
      .from("fb_venues")
      .select("id, code, hole_range_start, hole_range_end, type")
      .in("id", venueIds);
    for (const v of (vs ?? []) as VenueRow[]) {
      venueMap.set(v.id, v);
    }
  }

  // Cargar últimos pings por grupo (últimos 30 min)
  type LivePos = { currentHole: number | null; lastTs: string };
  const liveByGroup = new Map<string, LivePos>();
  if (groupIds.size > 0) {
    const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const { data: pings } = await admin
      .from("ritmo_positions")
      .select("group_id, hoyo_detectado, ts")
      .in("group_id", Array.from(groupIds))
      .gte("ts", cutoff)
      .order("ts", { ascending: false });
    // Agrupar y calcular moda de los hoyos en últimos 10 pings
    const byGroup = new Map<string, { hoyos: number[]; lastTs: string }>();
    for (const p of (pings ?? []) as Array<{
      group_id: string;
      hoyo_detectado: number | null;
      ts: string;
    }>) {
      const arr = byGroup.get(p.group_id) ?? { hoyos: [], lastTs: p.ts };
      if (arr.hoyos.length < 10 && p.hoyo_detectado != null) {
        arr.hoyos.push(p.hoyo_detectado);
      }
      byGroup.set(p.group_id, arr);
    }
    for (const [gid, agg] of byGroup) {
      const counts = new Map<number, number>();
      for (const h of agg.hoyos) counts.set(h, (counts.get(h) ?? 0) + 1);
      let modeHole: number | null = null;
      let best = 0;
      for (const [h, c] of counts) {
        if (c > best) {
          best = c;
          modeHole = h;
        }
      }
      liveByGroup.set(gid, { currentHole: modeHole, lastTs: agg.lastTs });
    }
  }

  // Helper para ETA simple en min: asumimos 15 min por hoyo (puede mejorarse
  // con course_holes.pace_minutes). Soporta wrap 18→1.
  const MIN_POR_HOYO_ESTIMADO = 15;
  function etaToHole(fromHole: number, toHole: number): number {
    if (fromHole === toHole) return 0;
    let diff = toHole - fromHole;
    if (diff < 0) diff += 18; // wrap
    return diff * MIN_POR_HOYO_ESTIMADO;
  }

  const now = Date.now();

  return rows.map((r) => {
    let clientKind: OrderForKitchen["clientKind"] = "unknown";
    let clientLabel = r.client_label ?? "";
    let groupNo: number | null = null;
    let groupId: string | null = null;
    if (r.entry_id) {
      clientKind = "player";
      clientLabel =
        playerNameByEntry.get(r.entry_id) || clientLabel || "Jugador";
      groupNo = groupNoByEntry.get(r.entry_id) ?? null;
      groupId = groupIdByEntry.get(r.entry_id) ?? null;
    } else if (r.caddie_id) {
      clientKind = "caddie";
      clientLabel =
        caddieNameById.get(r.caddie_id) || clientLabel || "Caddie";
      groupId = groupIdByCaddie.get(r.caddie_id) ?? null;
    } else if (r.table_id) {
      // Pedido tomado en mesa (mesero o QR). Mostrar "🪑 Mesa M3 · Comensal"
      clientKind = "table";
      const tbl = tableInfoById.get(r.table_id);
      const code = tbl?.code ?? "—";
      clientLabel = r.diner_name
        ? `🪑 Mesa ${code} · ${r.diner_name}`
        : `🪑 Mesa ${code}`;
    }

    // Ubicación en vivo del cliente
    const live = groupId ? liveByGroup.get(groupId) : null;
    let currentHole: number | null = null;
    let lastSeenAgoMin: number | null = null;
    let etaMin: number | null = null;
    if (live) {
      currentHole = live.currentHole;
      lastSeenAgoMin = Math.round(
        (now - new Date(live.lastTs).getTime()) / 60000
      );
      // Calcular ETA al destino según tipo de venue
      const venue = venueMap.get(r.venue_id);
      if (currentHole != null) {
        let destHole: number | null = null;
        if (r.delivery_type === "on_course" && r.requested_hole) {
          // Carrito: ETA al hoyo donde el cliente pidió la entrega
          destHole = r.requested_hole;
        } else if (venue?.type === "restaurant") {
          // Pickup: el restaurante Hoyo 6 (default code 'h6' → hoyo 6).
          // En el seed inicial el restaurante es 'h6' del CCQ.
          destHole = venue.code === "h6" ? 6 : null;
        }
        if (destHole != null) {
          etaMin = etaToHole(currentHole, destHole);
        }
      }
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
      groupId,
      liveLocation: {
        currentHole,
        lastSeenAgoMin,
        etaMin,
      },
      items: linesByOrder.get(r.id) ?? [],
    };
  });
}
