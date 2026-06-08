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

/** Cancelar pedido (cocina sin existencias, cliente se arrepintió, etc.) */
export async function cancelOrder(
  orderId: string,
  reason?: string
): Promise<UpdateResult> {
  return updateOrderStatus(orderId, "cancelled", {
    cancelled_reason: reason?.trim() || null,
  });
}
