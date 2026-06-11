import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { appBaseUrl, getStripe } from "@/lib/stripe/server";
import { applyStockDecrement } from "./stockMovements";
import {
  notifyClientPaymentReceived,
  notifyStaffPaymentReceived,
} from "./notifyFbPayment";
import { requiresPrepay } from "./prepayRequired";
import type { DeliveryType } from "./types";

type ClientIdentity = {
  entryId: string | null;
  caddieId: string | null;
  playerId: string | null;
};

function identityQuery(
  admin: SupabaseClient,
  id: ClientIdentity,
  orderId: string
) {
  let q = admin.from("fb_orders").select("*").eq("id", orderId);
  if (id.entryId) q = q.eq("entry_id", id.entryId);
  else if (id.caddieId) q = q.eq("caddie_id", id.caddieId);
  else if (id.playerId) q = q.eq("player_id", id.playerId);
  return q;
}

function isValidEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Resuelve el correo del cliente para precargarlo en Stripe Checkout.
 *  Evita que Stripe Link muestre un correo viejo/equivocado guardado en el
 *  dispositivo: si pasamos customer_email, Checkout usa ese. */
async function resolveClientEmail(
  admin: SupabaseClient,
  id: ClientIdentity
): Promise<string | undefined> {
  let playerId = id.playerId;
  if (!playerId && id.entryId) {
    const { data } = await admin
      .from("tournament_entries")
      .select("player_id")
      .eq("id", id.entryId)
      .maybeSingle();
    playerId = (data as { player_id?: string } | null)?.player_id ?? null;
  }
  if (!playerId) return undefined;
  const { data } = await admin
    .from("players")
    .select("email")
    .eq("id", playerId)
    .maybeSingle();
  const email = (data as { email?: string | null } | null)?.email?.trim();
  return isValidEmail(email) ? email : undefined;
}

export async function verifyOrderOwnership(
  admin: SupabaseClient,
  orderId: string,
  id: ClientIdentity
): Promise<{ ok: true; order: Record<string, unknown> } | { ok: false; error: string }> {
  const { data, error } = await identityQuery(admin, id, orderId).maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Pedido no encontrado o no es tuyo." };
  return { ok: true, order: data as Record<string, unknown> };
}

/** Crea sesión de Stripe Checkout para un pedido existente. */
export async function createCheckoutForOrder(
  admin: SupabaseClient,
  orderId: string,
  id: ClientIdentity,
  returnQuery: string
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: false,
      error: "Pagos con tarjeta no configurados todavía (falta STRIPE_SECRET_KEY).",
    };
  }

  const owned = await verifyOrderOwnership(admin, orderId, id);
  if (!owned.ok) return owned;

  const order = owned.order;
  const status = String(order.status ?? "");
  const deliveryType = String(order.delivery_type ?? "") as DeliveryType;
  const totalCents = Number(order.total_cents ?? 0);

  if (totalCents <= 0) {
    return { ok: false, error: "El pedido no tiene monto a cobrar." };
  }

  const prepay = requiresPrepay(deliveryType);
  if (prepay && status !== "pending_payment") {
    return { ok: false, error: "Este pedido ya no está pendiente de prepago." };
  }
  if (!prepay && status !== "delivered") {
    return {
      ok: false,
      error: "Solo puedes pagar pedidos entregados y confirmados.",
    };
  }

  const { data: items } = await admin
    .from("fb_order_items")
    .select("qty, unit_price_cents, item_name_snapshot")
    .eq("order_id", orderId);

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = (
    (items ?? []) as Array<{
      qty: number;
      unit_price_cents: number;
      item_name_snapshot: string;
    }>
  ).map((it) => ({
    price_data: {
      currency: "mxn",
      unit_amount: it.unit_price_cents,
      product_data: { name: it.item_name_snapshot },
    },
    quantity: it.qty,
  }));

  if (lineItems.length === 0) {
    lineItems.push({
      price_data: {
        currency: "mxn",
        unit_amount: totalCents,
        product_data: { name: "Pedido List.Golf" },
      },
      quantity: 1,
    });
  }

  const base = appBaseUrl();
  const customerEmail = await resolveClientEmail(admin, id);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    line_items: lineItems,
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    success_url: `${base}/captura/menu/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&${returnQuery}`,
    cancel_url: `${base}/captura/menu/pago-cancelado?${returnQuery}`,
    metadata: {
      order_id: orderId,
      payment_kind: prepay ? "prepay" : "settle",
    },
    payment_intent_data: {
      metadata: {
        order_id: orderId,
        payment_kind: prepay ? "prepay" : "settle",
      },
    },
  });

  if (!session.url) {
    return { ok: false, error: "Stripe no devolvió URL de pago." };
  }

  await admin
    .from("fb_orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", orderId);

  return { ok: true, url: session.url };
}

/** Crea sesión para pagar TODA la cuenta abierta (varios pedidos delivered). */
export async function createCheckoutForAccount(
  admin: SupabaseClient,
  id: ClientIdentity,
  returnQuery: string
): Promise<{ ok: true; url: string; orderIds: string[] } | { ok: false; error: string }> {
  const stripe = getStripe();
  if (!stripe) {
    return {
      ok: false,
      error: "Pagos con tarjeta no configurados todavía (falta STRIPE_SECRET_KEY).",
    };
  }

  let q = admin
    .from("fb_orders")
    .select("id, total_cents, client_label, delivery_type")
    .eq("status", "delivered")
    .order("created_at", { ascending: true });
  if (id.entryId) q = q.eq("entry_id", id.entryId);
  else if (id.caddieId) q = q.eq("caddie_id", id.caddieId);
  else if (id.playerId) q = q.eq("player_id", id.playerId);
  else return { ok: false, error: "Falta identidad del cliente." };

  const { data: orders, error } = await q;
  if (error) return { ok: false, error: error.message };
  const rows = (orders ?? []) as Array<{
    id: string;
    total_cents: number;
    client_label: string | null;
    delivery_type: string;
  }>;
  if (rows.length === 0) {
    return { ok: false, error: "No tienes consumos pendientes de pago." };
  }

  const orderIds = rows.map((o) => o.id);
  const totalCents = rows.reduce((a, o) => a + Number(o.total_cents ?? 0), 0);
  const clientLabel = rows[0]?.client_label?.trim() || "Cuenta List.Golf";

  const base = appBaseUrl();
  const customerEmail = await resolveClientEmail(admin, id);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    ...(customerEmail ? { customer_email: customerEmail } : {}),
    line_items: [
      {
        price_data: {
          currency: "mxn",
          unit_amount: totalCents,
          product_data: {
            name: `Cuenta ${clientLabel}`,
            description: `${rows.length} pedido(s) confirmados`,
          },
        },
        quantity: 1,
      },
    ],
    success_url: `${base}/captura/menu/pago-exitoso?session_id={CHECKOUT_SESSION_ID}&${returnQuery}`,
    cancel_url: `${base}/captura/menu/pago-cancelado?${returnQuery}`,
    metadata: {
      order_ids: orderIds.join(","),
      payment_kind: "settle_account",
    },
    payment_intent_data: {
      metadata: {
        order_ids: orderIds.join(","),
        payment_kind: "settle_account",
      },
    },
  });

  if (!session.url) {
    return { ok: false, error: "Stripe no devolvió URL de pago." };
  }

  await admin
    .from("fb_orders")
    .update({ stripe_checkout_session_id: session.id })
    .in("id", orderIds);

  return { ok: true, url: session.url, orderIds };
}

/** Procesa un checkout.session.completed de Stripe (idempotente). */
export async function fulfillStripeCheckoutSession(
  admin: SupabaseClient,
  session: Stripe.Checkout.Session
): Promise<{ ok: boolean; error?: string }> {
  const paymentKind = session.metadata?.payment_kind ?? "settle";
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id ?? null;

  const now = new Date().toISOString();
  const paidPatch = {
    paid_at: now,
    paid_method: "tarjeta_stripe",
    paid_notes: `Stripe ${session.id}`,
    stripe_checkout_session_id: session.id,
    stripe_payment_intent_id: paymentIntentId,
  };

  if (paymentKind === "prepay") {
    const orderId = session.metadata?.order_id;
    if (!orderId) return { ok: false, error: "Falta order_id en metadata." };

    const { data: existing } = await admin
      .from("fb_orders")
      .select("id, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!existing) return { ok: false, error: "Pedido no encontrado." };
    if ((existing as { status: string }).status === "pending") {
      return { ok: true }; // ya procesado
    }
    if ((existing as { status: string }).status !== "pending_payment") {
      return { ok: false, error: "Estado de pedido inválido para prepago." };
    }

    const { error } = await admin
      .from("fb_orders")
      .update({
        status: "pending",
        ...paidPatch,
      })
      .eq("id", orderId)
      .eq("status", "pending_payment");
    if (error) return { ok: false, error: error.message };

    const { data: order } = await admin
      .from("fb_orders")
      .select(
        "id, total_cents, client_label, entry_id, caddie_id, player_id, status"
      )
      .eq("id", orderId)
      .maybeSingle();
    if (order) {
      const row = order as {
        id: string;
        total_cents: number;
        client_label?: string | null;
        entry_id?: string | null;
        caddie_id?: string | null;
        player_id?: string | null;
        status: string;
      };
      await notifyClientPaymentReceived(admin, row);
      await notifyStaffPaymentReceived(row);
    }
    return { ok: true };
  }

  const orderIdsRaw =
    session.metadata?.order_ids ?? session.metadata?.order_id ?? "";
  const orderIds = orderIdsRaw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (orderIds.length === 0) {
    return { ok: false, error: "Falta order_id(s) en metadata." };
  }

  for (const orderId of orderIds) {
    const { data: existing } = await admin
      .from("fb_orders")
      .select("id, status")
      .eq("id", orderId)
      .maybeSingle();
    if (!existing) continue;
    if ((existing as { status: string }).status === "paid") continue;
    if ((existing as { status: string }).status !== "delivered") {
      return { ok: false, error: `Pedido ${orderId} no está en delivered.` };
    }

    const { error } = await admin
      .from("fb_orders")
      .update({
        status: "paid",
        ...paidPatch,
      })
      .eq("id", orderId)
      .eq("status", "delivered");
    if (error) return { ok: false, error: error.message };
    await applyStockDecrement(admin, orderId);
  }

  const { data: first } = await admin
    .from("fb_orders")
    .select(
      "id, total_cents, client_label, entry_id, caddie_id, player_id, status"
    )
    .eq("id", orderIds[0])
    .maybeSingle();

  if (first) {
    const paidTotal = Number(session.amount_total ?? 0);
    await notifyClientPaymentReceived(admin, {
      ...(first as Record<string, unknown>),
      total_cents: paidTotal,
    } as {
      id: string;
      total_cents: number;
      client_label?: string | null;
      entry_id?: string | null;
      caddie_id?: string | null;
      player_id?: string | null;
    });
    await notifyStaffPaymentReceived({
      id: orderIds[0],
      total_cents: Number(session.amount_total ?? 0),
      client_label: (first as { client_label?: string }).client_label,
      status: "paid",
    });
  }

  return { ok: true };
}
