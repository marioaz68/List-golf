/**
 * Movimientos de inventario asociados a un pedido.
 *
 * Reglas:
 *  - Decrementar SOLO cuando el venue (carrito) tiene fila en fb_venue_stock
 *    para ese menu_item. Si no hay fila → stock infinito, no hacer nada.
 *  - Idempotente: usa fb_orders.stock_decremented_at para no descontar dos
 *    veces el mismo pedido.
 *  - Reversión: si el pedido se cancela después de haberse descontado,
 *    devolver al stock e invalidar el timestamp.
 *  - Nunca permitir qty_available negativo (CHECK constraint en BD).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

interface OrderLine {
  menu_item_id: string;
  qty: number;
}

async function loadOrderForMovement(
  admin: SupabaseClient,
  orderId: string
): Promise<{
  ok: boolean;
  venueId?: string;
  lines?: OrderLine[];
  decrementedAt?: string | null;
  error?: string;
}> {
  const { data: order } = await admin
    .from("fb_orders")
    .select("id, venue_id, stock_decremented_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: "Pedido no existe." };
  const o = order as {
    id: string;
    venue_id: string;
    stock_decremented_at: string | null;
  };
  const { data: itemsRaw } = await admin
    .from("fb_order_items")
    .select("menu_item_id, qty")
    .eq("order_id", orderId);
  const lines = ((itemsRaw ?? []) as Array<Record<string, unknown>>).map(
    (l) => ({
      menu_item_id: String(l.menu_item_id),
      qty: Number(l.qty ?? 0),
    })
  );
  return {
    ok: true,
    venueId: o.venue_id,
    lines,
    decrementedAt: o.stock_decremented_at,
  };
}

/** Descuenta del inventario las cantidades del pedido. Idempotente. */
export async function applyStockDecrement(
  admin: SupabaseClient,
  orderId: string
): Promise<{ ok: boolean; decremented?: number; error?: string }> {
  const ctx = await loadOrderForMovement(admin, orderId);
  if (!ctx.ok || !ctx.venueId || !ctx.lines) {
    return { ok: false, error: ctx.error };
  }
  if (ctx.decrementedAt) {
    return { ok: true, decremented: 0 }; // ya se hizo
  }

  // Cargar stock actual del venue para esos items (solo los que tienen fila)
  const itemIds = ctx.lines.map((l) => l.menu_item_id);
  const { data: stockRaw } = await admin
    .from("fb_venue_stock")
    .select("menu_item_id, qty_available")
    .eq("venue_id", ctx.venueId)
    .in("menu_item_id", itemIds);
  const stockMap = new Map<string, number>();
  for (const s of (stockRaw ?? []) as Array<Record<string, unknown>>) {
    stockMap.set(String(s.menu_item_id), Number(s.qty_available ?? 0));
  }

  let count = 0;
  for (const line of ctx.lines) {
    const current = stockMap.get(line.menu_item_id);
    if (current == null) continue; // sin fila = infinito, no descontar
    const next = Math.max(0, current - line.qty);
    if (next === current) continue;
    const { error } = await admin
      .from("fb_venue_stock")
      .update({ qty_available: next, updated_at: new Date().toISOString() })
      .eq("venue_id", ctx.venueId)
      .eq("menu_item_id", line.menu_item_id);
    if (error) {
      console.error("applyStockDecrement update:", error);
      continue;
    }
    count++;
  }

  // Marcar pedido como descontado (aunque count=0, para no reintentar)
  await admin
    .from("fb_orders")
    .update({ stock_decremented_at: new Date().toISOString() })
    .eq("id", orderId);

  return { ok: true, decremented: count };
}

/** Devuelve al inventario las cantidades del pedido cancelado (idempotente). */
export async function revertStockDecrement(
  admin: SupabaseClient,
  orderId: string
): Promise<{ ok: boolean; reverted?: number; error?: string }> {
  const ctx = await loadOrderForMovement(admin, orderId);
  if (!ctx.ok || !ctx.venueId || !ctx.lines) {
    return { ok: false, error: ctx.error };
  }
  if (!ctx.decrementedAt) {
    return { ok: true, reverted: 0 }; // nunca se descontó
  }

  const itemIds = ctx.lines.map((l) => l.menu_item_id);
  const { data: stockRaw } = await admin
    .from("fb_venue_stock")
    .select("menu_item_id, qty_available")
    .eq("venue_id", ctx.venueId)
    .in("menu_item_id", itemIds);
  const stockMap = new Map<string, number>();
  for (const s of (stockRaw ?? []) as Array<Record<string, unknown>>) {
    stockMap.set(String(s.menu_item_id), Number(s.qty_available ?? 0));
  }

  let count = 0;
  for (const line of ctx.lines) {
    const current = stockMap.get(line.menu_item_id);
    if (current == null) continue; // sin fila = infinito
    const next = current + line.qty;
    const { error } = await admin
      .from("fb_venue_stock")
      .update({ qty_available: next, updated_at: new Date().toISOString() })
      .eq("venue_id", ctx.venueId)
      .eq("menu_item_id", line.menu_item_id);
    if (!error) count++;
  }

  await admin
    .from("fb_orders")
    .update({ stock_decremented_at: null })
    .eq("id", orderId);

  return { ok: true, reverted: count };
}
