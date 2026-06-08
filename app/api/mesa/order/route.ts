/**
 * POST /api/mesa/order — endpoint PÚBLICO para que un comensal mande un
 * pedido desde el QR de su mesa.
 *
 * El pedido se crea con `requires_waiter_approval=true` y status='pending'.
 * Un mesero debe aprobarlo en /fb-mesero antes de que la cocina lo prepare.
 *
 * Anti-abuso simple:
 *   - máximo 10 órdenes pendientes por mesa al mismo tiempo
 *   - máximo 30 items por orden
 *   - precio total tope $5000 (todo lo demás es un error de mesa real, el
 *     mesero lo rechaza)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

const MAX_ITEMS = 30;
const MAX_TOTAL_CENTS = 500_000;
const MAX_PENDING_PER_TABLE = 10;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }
  const o = body as Record<string, unknown>;
  const tableCode = String(o.tableCode ?? "").trim();
  const dinerName = String(o.dinerName ?? "").trim();
  const rawItems = Array.isArray(o.items) ? o.items : [];

  if (!tableCode) {
    return NextResponse.json({ ok: false, error: "Falta tableCode." }, { status: 400 });
  }
  if (!dinerName) {
    return NextResponse.json(
      { ok: false, error: "Por favor escribe tu nombre antes de pedir." },
      { status: 400 }
    );
  }
  if (rawItems.length === 0) {
    return NextResponse.json({ ok: false, error: "Pedido vacío." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolver mesa
  const { data: tableRow } = await admin
    .from("fb_tables")
    .select("id, venue_id, is_active, code")
    .eq("code", tableCode)
    .eq("is_active", true)
    .maybeSingle();
  if (!tableRow) {
    return NextResponse.json({ ok: false, error: "Mesa no encontrada." }, { status: 404 });
  }
  const table = tableRow as {
    id: string;
    venue_id: string;
    is_active: boolean;
    code: string;
  };

  // Rate limit por mesa (cuenta pendientes de aprobación)
  const { count: pendingCount } = await admin
    .from("fb_orders")
    .select("id", { count: "exact", head: true })
    .eq("table_id", table.id)
    .eq("requires_waiter_approval", true);
  if ((pendingCount ?? 0) >= MAX_PENDING_PER_TABLE) {
    return NextResponse.json(
      {
        ok: false,
        error: "Tu mesa tiene demasiados pedidos esperando aprobación. Espera al mesero.",
      },
      { status: 429 }
    );
  }

  // Validar items
  const itemIds: string[] = [];
  const counts = new Map<string, { qty: number; notes: string | null }>();
  let totalQty = 0;
  for (const raw of rawItems) {
    const r = raw as Record<string, unknown>;
    const id = String(r.menuItemId ?? "").trim();
    const qty = Math.max(1, Math.floor(Number(r.qty ?? 0)));
    if (!id || qty <= 0) continue;
    if (!itemIds.includes(id)) itemIds.push(id);
    const prev = counts.get(id);
    counts.set(id, {
      qty: (prev?.qty ?? 0) + qty,
      notes: r.notes ? String(r.notes) : null,
    });
    totalQty += qty;
    if (totalQty > MAX_ITEMS) {
      return NextResponse.json(
        { ok: false, error: `Demasiados items (máx ${MAX_ITEMS}).` },
        { status: 400 }
      );
    }
  }
  if (itemIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Pedido vacío." }, { status: 400 });
  }

  // Resolver precios desde BD
  const { data: priceRows } = await admin
    .from("fb_menu_items")
    .select("id, name, price_cents, available_venue_ids, is_active")
    .in("id", itemIds);
  const priceMap = new Map<
    string,
    { id: string; name: string; priceCents: number; venues: string[]; active: boolean }
  >();
  for (const r of (priceRows ?? []) as Array<Record<string, unknown>>) {
    priceMap.set(String(r.id), {
      id: String(r.id),
      name: String(r.name),
      priceCents: Number(r.price_cents ?? 0),
      venues: Array.isArray(r.available_venue_ids)
        ? (r.available_venue_ids as string[])
        : [],
      active: Boolean(r.is_active),
    });
  }

  let totalCents = 0;
  const lines: Array<{
    menu_item_id: string;
    qty: number;
    unit_price_cents: number;
    item_name_snapshot: string;
    notes: string | null;
  }> = [];
  for (const [id, info] of counts.entries()) {
    const ref = priceMap.get(id);
    if (!ref || !ref.active) {
      return NextResponse.json(
        { ok: false, error: "Algún item ya no está disponible. Refresca." },
        { status: 400 }
      );
    }
    if (!ref.venues.includes(table.venue_id)) {
      return NextResponse.json(
        { ok: false, error: `"${ref.name}" no se sirve en este restaurante.` },
        { status: 400 }
      );
    }
    lines.push({
      menu_item_id: id,
      qty: info.qty,
      unit_price_cents: ref.priceCents,
      item_name_snapshot: ref.name,
      notes: info.notes,
    });
    totalCents += ref.priceCents * info.qty;
  }

  if (totalCents > MAX_TOTAL_CENTS) {
    return NextResponse.json(
      { ok: false, error: "El total excede el límite. Pide en partes o al mesero." },
      { status: 400 }
    );
  }

  // Insertar pedido
  const { data: orderRow, error: orderErr } = await admin
    .from("fb_orders")
    .insert({
      venue_id: table.venue_id,
      table_id: table.id,
      delivery_type: "dine_in",
      source_channel: "qr_table",
      status: "pending",
      requires_waiter_approval: true,
      total_cents: totalCents,
      diner_name: dinerName.slice(0, 80),
    })
    .select("id")
    .single();
  if (orderErr || !orderRow) {
    return NextResponse.json(
      { ok: false, error: orderErr?.message ?? "Error creando pedido." },
      { status: 500 }
    );
  }
  const orderId = (orderRow as { id: string }).id;

  const lineRows = lines.map((l) => ({ ...l, order_id: orderId }));
  const { error: itemsErr } = await admin.from("fb_order_items").insert(lineRows);
  if (itemsErr) {
    await admin.from("fb_orders").delete().eq("id", orderId);
    return NextResponse.json({ ok: false, error: itemsErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, orderId, totalCents });
}
