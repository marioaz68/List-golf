/**
 * POST /api/captura/fb-order/accept
 *
 * El cliente (jugador o caddie) acepta o disputa la entrega de un pedido
 * que está en estado 'pending_acceptance'.
 *
 * Body:
 *   {
 *     order_id: string,
 *     action: 'accept' | 'dispute',
 *     reason?: string,         // solo si action='dispute'
 *     entry_id?: string,       // identificación del cliente
 *     caddie_id?: string
 *   }
 *
 * Verifica que el order_id pertenece al entry_id / caddie_id del cliente
 * (no se puede aceptar pedido ajeno).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  clientAcceptDelivery,
  clientDisputeDelivery,
} from "@/lib/fb/orderActions";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const orderId = String(o.order_id ?? "").trim();
  const action = String(o.action ?? "").trim();
  const reason = o.reason ? String(o.reason) : undefined;
  const entryId = o.entry_id ? String(o.entry_id).trim() : null;
  const caddieId = o.caddie_id ? String(o.caddie_id).trim() : null;
  const playerId = o.player_id ? String(o.player_id).trim() : null;

  if (!orderId) {
    return NextResponse.json({ ok: false, error: "Falta order_id." }, { status: 400 });
  }
  if (action !== "accept" && action !== "dispute") {
    return NextResponse.json(
      { ok: false, error: "action debe ser 'accept' o 'dispute'." },
      { status: 400 }
    );
  }
  if (!entryId && !caddieId && !playerId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id, caddie_id o player_id del cliente." },
      { status: 400 }
    );
  }

  // Verificar dueño del pedido
  const admin = createAdminClient();
  const { data: ord, error } = await admin
    .from("fb_orders")
    .select("id, entry_id, caddie_id, player_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!ord) {
    return NextResponse.json({ ok: false, error: "Pedido no encontrado." }, { status: 404 });
  }

  const owns =
    (entryId && (ord as { entry_id?: string }).entry_id === entryId) ||
    (caddieId && (ord as { caddie_id?: string }).caddie_id === caddieId) ||
    (playerId && (ord as { player_id?: string }).player_id === playerId);
  if (!owns) {
    return NextResponse.json(
      { ok: false, error: "Este pedido no es tuyo." },
      { status: 403 }
    );
  }
  if ((ord as { status?: string }).status !== "pending_acceptance") {
    return NextResponse.json(
      { ok: false, error: "El pedido no está pendiente de tu confirmación." },
      { status: 409 }
    );
  }

  const result =
    action === "accept"
      ? await clientAcceptDelivery(orderId)
      : await clientDisputeDelivery(orderId, reason);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
