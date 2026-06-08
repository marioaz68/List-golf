/**
 * GET  /api/captura/cart-stock?venue_id=...   Lista stock actual del carrito
 * POST /api/captura/cart-stock                Actualiza qty de un item
 *
 * Sin auth especial — el operador del carrito accede desde la URL del QR.
 * En el futuro se puede agregar un token corto compartido si se necesita
 * más seguridad.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

interface StockItem {
  menuItemId: string;
  name: string;
  emoji: string | null;
  imageUrl: string | null;
  priceCents: number;
  qtyAvailable: number;
  lowThreshold: number;
  isInfinite: boolean;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const venueId = url.searchParams.get("venue_id")?.trim();
  if (!venueId) {
    return NextResponse.json({ ok: false, error: "Falta venue_id." }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verificar venue
  const { data: venue } = await admin
    .from("fb_venues")
    .select("id, type, code, name")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json({ ok: false, error: "Venue no encontrado." }, { status: 404 });
  }

  // Cargar items disponibles en este venue
  const { data: itemsRaw } = await admin
    .from("fb_menu_items")
    .select("id, name, display_emoji, image_url, price_cents, available_venue_ids")
    .eq("is_active", true);

  const items = (itemsRaw ?? []).filter((it: Record<string, unknown>) => {
    const arr = it.available_venue_ids;
    return Array.isArray(arr) && (arr as string[]).includes(venueId);
  });

  // Cargar stock existente
  const { data: stockRaw } = await admin
    .from("fb_venue_stock")
    .select("menu_item_id, qty_available, low_threshold")
    .eq("venue_id", venueId);
  const stockMap = new Map<string, { qty: number; low: number }>();
  for (const s of (stockRaw ?? []) as Array<Record<string, unknown>>) {
    stockMap.set(String(s.menu_item_id), {
      qty: Number(s.qty_available ?? 0),
      low: Number(s.low_threshold ?? 3),
    });
  }

  const stock: StockItem[] = items.map((it: Record<string, unknown>) => {
    const id = String(it.id);
    const s = stockMap.get(id);
    return {
      menuItemId: id,
      name: String(it.name ?? ""),
      emoji: it.display_emoji ? String(it.display_emoji) : null,
      imageUrl: it.image_url ? String(it.image_url) : null,
      priceCents: Number(it.price_cents ?? 0),
      qtyAvailable: s?.qty ?? 0,
      lowThreshold: s?.low ?? 3,
      isInfinite: s == null, // sin fila = infinito
    };
  });

  // Ordenar por nombre
  stock.sort((a, b) => a.name.localeCompare(b.name));

  return NextResponse.json({ ok: true, venue, stock });
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const venueId = String(o.venue_id ?? "").trim();
  const menuItemId = String(o.menu_item_id ?? "").trim();
  const action = String(o.action ?? "set").trim() as "set" | "inc" | "dec" | "remove";
  const qty = Number(o.qty ?? 0);

  if (!venueId || !menuItemId) {
    return NextResponse.json(
      { ok: false, error: "Falta venue_id o menu_item_id." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  if (action === "remove") {
    // Quita la fila → vuelve a stock infinito
    const { error } = await admin
      .from("fb_venue_stock")
      .delete()
      .eq("venue_id", venueId)
      .eq("menu_item_id", menuItemId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, removed: true });
  }

  // set / inc / dec
  let nextQty = 0;
  if (action === "set") {
    if (!Number.isFinite(qty) || qty < 0) {
      return NextResponse.json({ ok: false, error: "qty inválida." }, { status: 400 });
    }
    nextQty = Math.floor(qty);
  } else {
    // Necesitamos leer el actual para inc/dec
    const { data: current } = await admin
      .from("fb_venue_stock")
      .select("qty_available")
      .eq("venue_id", venueId)
      .eq("menu_item_id", menuItemId)
      .maybeSingle();
    const curQty = current ? Number((current as { qty_available?: number }).qty_available ?? 0) : 0;
    const delta = Number.isFinite(qty) ? Math.floor(qty) : 1;
    nextQty = action === "inc" ? curQty + delta : Math.max(0, curQty - delta);
  }

  const { error } = await admin
    .from("fb_venue_stock")
    .upsert(
      {
        venue_id: venueId,
        menu_item_id: menuItemId,
        qty_available: nextQty,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,menu_item_id" }
    );
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, qtyAvailable: nextQty });
}
