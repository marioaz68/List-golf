"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/utils/supabase/admin";
import type { OrderStatus } from "./types";

/**
 * Server actions para que cocina y operadores de carrito bar avancen el
 * status de los pedidos F&B.
 *
 * Flujo típico:
 *   pending → accepted → preparing → ready → (on_the_way) → delivered
 *   o en cualquier punto: cancelled
 *
 * Todas estas actions usan service_role (createAdminClient) porque las
 * páginas /fb-cocina y /fb-carrito-bar viven en el backoffice protegido
 * por el módulo 'fb' (roles: super_admin, club_admin, tournament_director,
 * restaurante).
 */

interface UpdateResult {
  ok: boolean;
  error?: string;
}

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, string>> = {
  accepted: "accepted_at",
  ready: "ready_at",
  pending_acceptance: "pending_acceptance_at",
  delivered: "delivered_at",
  paid: "paid_at",
  disputed: "disputed_at",
  cancelled: "cancelled_at",
};

async function updateOrderStatus(
  orderId: string,
  nextStatus: OrderStatus,
  extras: Record<string, unknown> = {}
): Promise<UpdateResult> {
  if (!orderId) return { ok: false, error: "Falta order_id." };
  const admin = createAdminClient();

  const patch: Record<string, unknown> = {
    status: nextStatus,
    ...extras,
  };
  const tsCol = STATUS_TIMESTAMP[nextStatus];
  if (tsCol) patch[tsCol] = new Date().toISOString();

  const { error } = await admin
    .from("fb_orders")
    .update(patch)
    .eq("id", orderId);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/fb-cocina");
  revalidatePath("/fb-carrito-bar");
  revalidatePath("/fb-admin");
  return { ok: true };
}

/** El restaurante / carrito acepta el pedido. */
export async function acceptOrder(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "accepted");
}

/** Cocina empieza a preparar el pedido. */
export async function markOrderPreparing(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "preparing");
}

/** Cocina termina el pedido — listo para entregar/recoger. */
export async function markOrderReady(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "ready");
}

/** Carrito sale en camino al hoyo del cliente. */
export async function markOrderOnTheWay(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "on_the_way");
}

/** Restaurante/carrito declara que entrego el pedido al cliente. NO se cobra
 *  todavía — el pedido queda en 'pending_acceptance' esperando que el cliente
 *  confirme desde su Mini App. */
export async function markOrderDelivered(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "pending_acceptance");
}

/** El CLIENTE confirma que recibió el pedido. Aquí se formaliza la compra
 *  (se carga a su cuenta del torneo). Solo el dueño del pedido puede llamar
 *  esto desde la Mini App. */
export async function clientAcceptDelivery(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "delivered");
}

/** El CLIENTE rechaza la entrega (no le llegó, le dieron incorrecto, etc.).
 *  Pasa a 'disputed' para que el comité revise antes de cargar o cancelar. */
export async function clientDisputeDelivery(
  orderId: string,
  reason?: string
): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "disputed", {
    disputed_reason: reason?.trim() || null,
  });
}

/** Restaurante recibió el pago físico (efectivo/tarjeta). Cierra la cuenta
 *  abierta del cliente. */
export async function markOrderPaid(
  orderId: string,
  method?: string,
  notes?: string
): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "paid", {
    paid_method: method?.trim() || null,
    paid_notes: notes?.trim() || null,
  });
}

/** Deshacer pago (error al cobrar, devolución). Solo vuelve a 'delivered'. */
export async function unmarkOrderPaid(orderId: string): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "delivered", {
    paid_method: null,
    paid_notes: null,
    paid_at: null,
  });
}

/** Cobrar TODOS los pedidos 'delivered' de un cliente en un torneo (cierre
 *  de cuenta cuando paga al final). */
export async function markAllPaidForClient(args: {
  tournamentId: string;
  entryId?: string | null;
  caddieId?: string | null;
  method?: string;
}): Promise<{ ok: boolean; updated: number; error?: string }> {
  const admin = createAdminClient();
  if (!args.entryId && !args.caddieId) {
    return { ok: false, updated: 0, error: "Falta entry_id o caddie_id." };
  }
  const patch = {
    status: "paid" as const,
    paid_at: new Date().toISOString(),
    paid_method: args.method?.trim() || null,
  };
  let q = admin
    .from("fb_orders")
    .update(patch)
    .eq("tournament_id", args.tournamentId)
    .eq("status", "delivered");
  if (args.entryId) q = q.eq("entry_id", args.entryId);
  if (args.caddieId) q = q.eq("caddie_id", args.caddieId);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, updated: 0, error: error.message };
  revalidatePath("/fb-cuentas");
  revalidatePath("/fb-cocina");
  return { ok: true, updated: data?.length ?? 0 };
}

/**
 * El restaurante/carrito crea un pedido EN NOMBRE del cliente (típico
 * cuando el cliente pidió verbalmente al carrito que pasaba por su hoyo).
 *
 * El pedido se crea en `pending_acceptance` (entregado, esperando OK del
 * cliente) si `alreadyDelivered=true`. Si no, en `pending` para que siga
 * el flujo normal de cocina.
 *
 * El cliente recibe el banner amarillo en su Mini App para confirmar
 * o rechazar el cargo a su cuenta.
 */
export async function createOrderForClient(input: {
  entryId?: string | null;
  caddieId?: string | null;
  venueId: string;
  deliveryType: "pickup" | "on_course";
  requestedHole?: number | null;
  notes?: string | null;
  items: Array<{ menuItemId: string; qty: number; notes?: string | null }>;
  alreadyDelivered: boolean;
}): Promise<{ ok: boolean; orderId?: string; total?: number; error?: string }> {
  const admin = createAdminClient();
  if (!input.entryId && !input.caddieId) {
    return { ok: false, error: "Falta entry_id o caddie_id del cliente." };
  }
  if (!input.venueId) return { ok: false, error: "Falta venue_id." };
  if (!input.items?.length) return { ok: false, error: "Sin items." };

  // Resolver tournament_id + client_label
  let tournamentId: string | null = null;
  let clientLabel: string | null = null;
  if (input.entryId) {
    const { data } = await admin
      .from("tournament_entries")
      .select("id, tournament_id, players ( first_name, last_name )")
      .eq("id", input.entryId)
      .maybeSingle();
    if (data) {
      tournamentId =
        (data as { tournament_id?: string }).tournament_id ?? null;
      const p = (data as { players: unknown }).players;
      const player = Array.isArray(p) ? p[0] : p;
      if (player) {
        const pl = player as { first_name?: string; last_name?: string };
        clientLabel =
          [pl.first_name, pl.last_name]
            .map((s) => String(s ?? "").trim())
            .filter(Boolean)
            .join(" ") || null;
      }
    }
  } else if (input.caddieId) {
    const { data } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .eq("id", input.caddieId)
      .maybeSingle();
    if (data) {
      const c = data as { first_name?: string; last_name?: string };
      clientLabel =
        [c.first_name, c.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null;
    }
    const { data: asg } = await admin
      .from("caddie_assignments")
      .select("tournament_id")
      .eq("caddie_id", input.caddieId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (asg) tournamentId = (asg as { tournament_id?: string }).tournament_id ?? null;
  }

  // Validar precios contra BD
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
    if (!ref.venues.includes(input.venueId)) {
      return { ok: false, error: `"${ref.name}" no se sirve en este venue.` };
    }
    const qty = Math.max(1, Math.floor(it.qty));
    lines.push({
      menuItemId: it.menuItemId,
      qty,
      unitPriceCents: ref.priceCents,
      name: ref.name,
      notes: it.notes ?? null,
    });
    totalCents += ref.priceCents * qty;
  }

  // Insertar orden
  const nowISO = new Date().toISOString();
  const insertOrder: Record<string, unknown> = {
    tournament_id: tournamentId,
    entry_id: input.entryId,
    caddie_id: input.caddieId,
    client_label: clientLabel,
    venue_id: input.venueId,
    delivery_type: input.deliveryType,
    requested_hole:
      input.deliveryType === "on_course" ? input.requestedHole ?? null : null,
    total_cents: totalCents,
    notes: input.notes?.trim() || null,
  };

  if (input.alreadyDelivered) {
    insertOrder.status = "pending_acceptance";
    insertOrder.accepted_at = nowISO;
    insertOrder.ready_at = nowISO;
    insertOrder.pending_acceptance_at = nowISO;
  } else {
    insertOrder.status = "pending";
  }

  const { data: orderRow, error: orderErr } = await admin
    .from("fb_orders")
    .insert(insertOrder)
    .select("id")
    .single();
  if (orderErr || !orderRow) {
    return { ok: false, error: orderErr?.message ?? "Error creando pedido." };
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

  revalidatePath("/fb-cocina");
  revalidatePath("/fb-cuentas");
  return { ok: true, orderId, total: totalCents };
}

/** Cancelar pedido (cocina sin existencias, cliente se arrepintió, etc.) */
export async function cancelOrder(
  orderId: string,
  reason?: string
): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "cancelled", {
    cancelled_reason: reason?.trim() || null,
  });
}
