/**
 * POST /api/captura/fb-order/checkout
 *
 * Abre Stripe Checkout para:
 *   - prepago de un pedido (order_id, status pending_payment)
 *   - liquidar cuenta abierta (pay_account: true, pedidos delivered)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  createCheckoutForAccount,
  createCheckoutForOrder,
} from "@/lib/fb/stripePayments";

export const dynamic = "force-dynamic";

function buildReturnQuery(o: Record<string, unknown>): string {
  const sp = new URLSearchParams();
  const entryId = String(o.entry_id ?? "").trim();
  const caddieId = String(o.caddie_id ?? "").trim();
  const playerId = String(o.player_id ?? "").trim();
  if (entryId) sp.set("me", entryId);
  else if (caddieId) sp.set("caddie", caddieId);
  else if (playerId) sp.set("player", playerId);
  return sp.toString();
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const entryId = String(o.entry_id ?? "").trim() || null;
  const caddieId = String(o.caddie_id ?? "").trim() || null;
  const playerId = String(o.player_id ?? "").trim() || null;
  const orderId = String(o.order_id ?? "").trim() || null;
  const payAccount = Boolean(o.pay_account);

  if (!entryId && !caddieId && !playerId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id, caddie_id o player_id." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const identity = { entryId, caddieId, playerId };
  const returnQuery = buildReturnQuery(o);

  if (payAccount) {
    const result = await createCheckoutForAccount(admin, identity, returnQuery);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      checkout_url: result.url,
      order_ids: result.orderIds,
    });
  }

  if (!orderId) {
    return NextResponse.json(
      { ok: false, error: "Falta order_id o pay_account." },
      { status: 400 }
    );
  }

  const result = await createCheckoutForOrder(
    admin,
    orderId,
    identity,
    returnQuery
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true, checkout_url: result.url, order_id: orderId });
}
