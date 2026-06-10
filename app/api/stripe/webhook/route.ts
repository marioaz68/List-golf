/**
 * Webhook de Stripe — confirma pagos y actualiza pedidos F&B.
 *
 * Configurar en Stripe Dashboard → Developers → Webhooks:
 *   URL: https://www.listgolf.club/api/stripe/webhook
 *   Evento: checkout.session.completed
 *
 * Variable: STRIPE_WEBHOOK_SECRET=whsec_...
 */
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createAdminClient } from "@/utils/supabase/admin";
import { fulfillStripeCheckoutSession } from "@/lib/fb/stripePayments";
import { getStripe } from "@/lib/stripe/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Stripe webhook no configurado." },
      { status: 500 }
    );
  }

  const body = await req.text();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ ok: false, error: "Falta firma." }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Firma inválida";
    console.error("Stripe webhook verify:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      return NextResponse.json({ ok: true, skipped: "unpaid" });
    }
    const admin = createAdminClient();
    const result = await fulfillStripeCheckoutSession(admin, session);
    if (!result.ok) {
      console.error("Stripe fulfill:", result.error);
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, received: true });
}
