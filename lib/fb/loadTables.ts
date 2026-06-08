/**
 * Carga las mesas del restaurante con el estado actual de su cuenta:
 *   - libre / abierta / pidiendo
 *   - total acumulado (sin cobrar)
 *   - antiguedad del pedido más viejo abierto
 *   - cantidad de pedidos pendientes de aprobación (QR)
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type TableState = "free" | "open" | "pending_approval";

export interface TableWithState {
  id: string;
  code: string;
  name: string | null;
  capacity: number;
  area: string;
  displayOrder: number;
  isActive: boolean;
  // estado calculado:
  state: TableState;
  openTotalCents: number;
  openOrdersCount: number;
  pendingApprovalCount: number;
  oldestOpenAt: string | null;
  servedByUserId: string | null;
}

const OPEN_STATUSES = new Set([
  "pending",
  "accepted",
  "preparing",
  "ready",
  "pending_acceptance",
  "delivered", // entregado pero todavía no pagado en mesa
]);

export async function loadVenueTables(
  supabase: SupabaseClient,
  venueId: string
): Promise<TableWithState[]> {
  const { data: tablesRaw } = await supabase
    .from("fb_tables")
    .select("id, code, name, capacity, area, display_order, is_active")
    .eq("venue_id", venueId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  const tables = (tablesRaw ?? []) as Array<{
    id: string;
    code: string;
    name: string | null;
    capacity: number;
    area: string;
    display_order: number;
    is_active: boolean;
  }>;

  if (tables.length === 0) return [];

  const tableIds = tables.map((t) => t.id);

  // Cargar todos los pedidos abiertos / por aprobar de estas mesas
  const { data: ordersRaw } = await supabase
    .from("fb_orders")
    .select(
      "id, table_id, status, total_cents, created_at, requires_waiter_approval, served_by_user_id"
    )
    .in("table_id", tableIds)
    .not("status", "in", "(paid,cancelled)")
    .order("created_at", { ascending: true });

  const byTable = new Map<
    string,
    {
      openTotal: number;
      openCount: number;
      pendingApproval: number;
      oldestAt: string | null;
      servedByUserId: string | null;
    }
  >();

  for (const o of (ordersRaw ?? []) as Array<Record<string, unknown>>) {
    const tid = String(o.table_id);
    const status = String(o.status);
    const needsApproval = Boolean(o.requires_waiter_approval);
    let s = byTable.get(tid);
    if (!s) {
      s = {
        openTotal: 0,
        openCount: 0,
        pendingApproval: 0,
        oldestAt: null,
        servedByUserId: null,
      };
      byTable.set(tid, s);
    }
    if (needsApproval) s.pendingApproval += 1;
    if (OPEN_STATUSES.has(status)) {
      s.openTotal += Number(o.total_cents ?? 0);
      s.openCount += 1;
      const created = String(o.created_at);
      if (!s.oldestAt || created < s.oldestAt) s.oldestAt = created;
      if (!s.servedByUserId && o.served_by_user_id) {
        s.servedByUserId = String(o.served_by_user_id);
      }
    }
  }

  return tables.map((t) => {
    const s = byTable.get(t.id);
    const pending = s?.pendingApproval ?? 0;
    const open = s?.openCount ?? 0;
    let state: TableState = "free";
    if (pending > 0) state = "pending_approval";
    else if (open > 0) state = "open";
    return {
      id: t.id,
      code: t.code,
      name: t.name,
      capacity: t.capacity,
      area: t.area,
      displayOrder: t.display_order,
      isActive: t.is_active,
      state,
      openTotalCents: s?.openTotal ?? 0,
      openOrdersCount: open,
      pendingApprovalCount: pending,
      oldestOpenAt: s?.oldestAt ?? null,
      servedByUserId: s?.servedByUserId ?? null,
    };
  });
}
