"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { OrderStatus } from "./types";
import { applyStockDecrement } from "./stockMovements";

/**
 * Server actions del módulo MESA (operador del restaurante).
 *
 * Cada comanda enviada a cocina = 1 fila en fb_orders con `table_id`.
 * Una mesa tiene N comandas hasta que el mesero cierre la cuenta:
 *   - createWaiterOrder        manda a cocina (status='accepted')
 *   - approveQrOrder           aprueba una orden creada desde QR
 *   - rejectQrOrder            rechaza una orden creada desde QR
 *   - payTableOrders           cierra TODAS las órdenes abiertas de la
 *                              mesa marcándolas paid (con propina/cuenta)
 */

interface UpdateResult {
  ok: boolean;
  error?: string;
}

export interface ComandaInput {
  tableId: string;
  notes?: string | null;
  items: Array<{
    menuItemId: string;
    qty: number;
    notes?: string | null;
  }>;
}

async function resolveServedByUserId(): Promise<string | null> {
  try {
    const supa = await createClient();
    const {
      data: { user },
    } = await supa.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

async function getVenueIdForTable(tableId: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("fb_tables")
    .select("venue_id")
    .eq("id", tableId)
    .maybeSingle();
  return data ? String((data as { venue_id: string }).venue_id) : null;
}

/** Mesero manda una comanda a cocina. Cada llamada = 1 fb_order nuevo. */
export async function createWaiterOrder(
  input: ComandaInput
): Promise<{ ok: boolean; orderId?: string; total?: number; error?: string }> {
  if (!input.tableId) return { ok: false, error: "Falta table_id." };
  if (!input.items?.length) return { ok: false, error: "Comanda vacía." };

  const admin = createAdminClient();
  const venueId = await getVenueIdForTable(input.tableId);
  if (!venueId) return { ok: false, error: "Mesa no existe." };

  const itemIds = input.items.map((it) => it.menuItemId);
  const { data: priceRows } = await admin
    .from("fb_menu_items")
    .select("id, name, price_cents, available_venue_ids, is_active")
    .in("id", itemIds);

  const priceMap = new Map<
    string,
    { id: string; name: string; priceCents: number; venues: string[]; active: boolean }
  >();
  for (const row of (priceRows ?? []) as Array<Record<string, unknown>>) {
    priceMap.set(String(row.id), {
      id: String(row.id),
      name: String(row.name),
      priceCents: Number(row.price_cents ?? 0),
      venues: Array.isArray(row.available_venue_ids)
        ? (row.available_venue_ids as string[])
        : [],
      active: Boolean(row.is_active),
    });
  }

  let totalCents = 0;
  const lines: Array<{
    menuItemId: string;
    qty: number;
    unitPriceCents: number;
    name: string;
    notes: string | null;
  }> = [];
  for (const it of input.items) {
    const ref = priceMap.get(it.menuItemId);
    if (!ref || !ref.active) {
      return { ok: false, error: `Item ${it.menuItemId} no disponible.` };
    }
    if (!ref.venues.includes(venueId)) {
      return { ok: false, error: `"${ref.name}" no se sirve aquí.` };
    }
    const qty = Math.max(1, Math.floor(it.qty));
    lines.push({
      menuItemId: it.menuItemId,
      qty,
      unitPriceCents: ref.priceCents,
      name: ref.name,
      notes: it.notes?.trim() || null,
    });
    totalCents += ref.priceCents * qty;
  }

  const servedBy = await resolveServedByUserId();
  const nowISO = new Date().toISOString();

  const { data: orderRow, error: orderErr } = await admin
    .from("fb_orders")
    .insert({
      venue_id: venueId,
      table_id: input.tableId,
      delivery_type: "dine_in",
      source_channel: "mesero",
      status: "accepted",
      accepted_at: nowISO,
      served_by_user_id: servedBy,
      total_cents: totalCents,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();

  if (orderErr || !orderRow) {
    return { ok: false, error: orderErr?.message ?? "Error creando comanda." };
  }
  const orderId = (orderRow as { id: string }).id;

  const lineRows = lines.map((l) => ({
    order_id: orderId,
    menu_item_id: l.menuItemId,
    qty: l.qty,
    unit_price_cents: l.unitPriceCents,
    item_name_snapshot: l.name,
    notes: l.notes,
  }));
  const { error: itemsErr } = await admin.from("fb_order_items").insert(lineRows);
  if (itemsErr) {
    await admin.from("fb_orders").delete().eq("id", orderId);
    return { ok: false, error: itemsErr.message };
  }

  revalidatePath("/fb-mesero");
  revalidatePath("/fb-cocina");
  return { ok: true, orderId, total: totalCents };
}

/** Mesero aprueba una orden creada desde el QR del comensal: pasa a la
 *  cocina como cualquier otra. */
export async function approveQrOrder(orderId: string): Promise<UpdateResult> {
  if (!orderId) return { ok: false, error: "Falta order_id." };
  const admin = createAdminClient();
  const servedBy = await resolveServedByUserId();
  const { error } = await admin
    .from("fb_orders")
    .update({
      requires_waiter_approval: false,
      status: "accepted",
      accepted_at: new Date().toISOString(),
      served_by_user_id: servedBy,
    })
    .eq("id", orderId)
    .eq("requires_waiter_approval", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-mesero");
  revalidatePath("/fb-cocina");
  return { ok: true };
}

/** Mesero rechaza una orden del QR (mesa equivocada, comensal se arrepintió). */
export async function rejectQrOrder(
  orderId: string,
  reason?: string
): Promise<UpdateResult> {
  if (!orderId) return { ok: false, error: "Falta order_id." };
  const admin = createAdminClient();
  const { error } = await admin
    .from("fb_orders")
    .update({
      requires_waiter_approval: false,
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_reason: reason?.trim() || "Rechazado por mesero",
    })
    .eq("id", orderId)
    .eq("requires_waiter_approval", true);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-mesero");
  return { ok: true };
}

/** Cobrar TODA la cuenta de una mesa. Cierra todas las órdenes abiertas
 *  de esa mesa marcándolas 'paid' con la propina y método elegidos.
 *  Si la cuenta se cargó a un socio (house_account_id), también queda
 *  registrado en cada orden para que /fb-reportes lo agrupe. */
export async function payTableOrders(args: {
  tableId: string;
  method: "cash" | "card" | "house_account" | string;
  tipCents?: number;
  houseAccountId?: string | null;
  splitCount?: number | null;
  notes?: string | null;
}): Promise<{ ok: boolean; updated: number; error?: string }> {
  if (!args.tableId) return { ok: false, updated: 0, error: "Falta table_id." };
  const admin = createAdminClient();

  // Cargar órdenes abiertas
  const { data: openRaw } = await admin
    .from("fb_orders")
    .select("id, total_cents, status")
    .eq("table_id", args.tableId)
    .not("status", "in", "(paid,cancelled)");
  const open = (openRaw ?? []) as Array<{
    id: string;
    total_cents: number;
    status: string;
  }>;
  if (open.length === 0) {
    return { ok: false, updated: 0, error: "Mesa sin cuenta abierta." };
  }

  // La propina la aplicamos toda al primer pedido para no duplicar.
  // El frontend muestra el total combinado.
  const firstId = open[0].id;
  const nowISO = new Date().toISOString();

  // Patch común a todos
  const commonPatch: Record<string, unknown> = {
    status: "paid",
    paid_at: nowISO,
    paid_method: args.method.trim() || null,
    paid_notes: args.notes?.trim() || null,
    house_account_id: args.houseAccountId ?? null,
    split_count: args.splitCount ?? null,
  };

  // Actualizar todas excepto la primera (sin propina)
  if (open.length > 1) {
    const restIds = open.slice(1).map((o) => o.id);
    const { error: e1 } = await admin
      .from("fb_orders")
      .update(commonPatch)
      .in("id", restIds);
    if (e1) return { ok: false, updated: 0, error: e1.message };
  }

  // Primera orden lleva la propina
  const firstPatch = { ...commonPatch, tip_cents: args.tipCents ?? 0 };
  const { error: e2 } = await admin
    .from("fb_orders")
    .update(firstPatch)
    .eq("id", firstId);
  if (e2) return { ok: false, updated: 0, error: e2.message };

  // Descontar inventario de cada orden cobrada (idempotente: si ya estaba
  // decrementada porque pasó por delivered, no hace nada)
  for (const o of open) {
    await applyStockDecrement(admin, o.id);
  }

  revalidatePath("/fb-mesero");
  revalidatePath("/fb-cuentas");
  revalidatePath("/fb-reportes");
  revalidatePath("/fb-inventario");
  return { ok: true, updated: open.length };
}
