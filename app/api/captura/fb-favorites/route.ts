/**
 * GET /api/captura/fb-favorites?entry_id=...   |   ?caddie_id=...
 *
 * Devuelve los items que el cliente (jugador o caddie) más ha pedido en
 * su historial. Solo cuenta pedidos NO cancelados ni en disputa.
 *
 * Para venue: opcional ?venue_id=... filtra para mostrar solo favoritos
 * disponibles en ese venue (ej. cuando el cliente está pidiendo al
 * carrito bar, solo le interesan los favoritos que llegan al carrito).
 *
 * Respuesta:
 *   { ok: true, favorites: [{ menuItem, timesOrdered, lastOrderedAt }] }
 *   máximo 8 items, ordenados por frecuencia desc, desempate por más reciente.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { FbMenuItem } from "@/lib/fb/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MAX_FAVORITES = 8;

interface FavoriteResponse {
  menuItem: Pick<
    FbMenuItem,
    "id" | "name" | "priceCents" | "imageUrl" | "displayEmoji" | "categoryId"
  >;
  categoryCode: string;
  timesOrdered: number;
  lastOrderedAt: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const entryId = url.searchParams.get("entry_id")?.trim() || null;
  const caddieId = url.searchParams.get("caddie_id")?.trim() || null;
  const venueId = url.searchParams.get("venue_id")?.trim() || null;

  if (!entryId && !caddieId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id o caddie_id." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // 1) Traer todos los items de pedidos NO cancelados/disputed del cliente
  //    junto con la fecha del pedido. Limitamos a últimos 6 meses para que
  //    los gustos viejos no pesen sobre los actuales.
  const sinceISO = new Date(
    Date.now() - 180 * 24 * 60 * 60 * 1000
  ).toISOString();

  let orderQuery = admin
    .from("fb_orders")
    .select("id, created_at, entry_id, caddie_id, status")
    .gte("created_at", sinceISO)
    .not("status", "in", "(cancelled,disputed)");
  if (entryId) orderQuery = orderQuery.eq("entry_id", entryId);
  else if (caddieId) orderQuery = orderQuery.eq("caddie_id", caddieId);

  const { data: ordersRaw, error: ordersErr } = await orderQuery;
  if (ordersErr) {
    console.error("FB FAVORITES orders:", ordersErr);
    return NextResponse.json(
      { ok: false, error: ordersErr.message },
      { status: 500 }
    );
  }
  const orders = (ordersRaw ?? []) as Array<{
    id: string;
    created_at: string;
  }>;
  if (orders.length === 0) {
    return NextResponse.json({ ok: true, favorites: [] });
  }
  const orderIds = orders.map((o) => o.id);
  const tsByOrder = new Map(orders.map((o) => [o.id, o.created_at]));

  // 2) Traer todas las líneas de esos pedidos
  const { data: linesRaw, error: linesErr } = await admin
    .from("fb_order_items")
    .select("menu_item_id, qty, order_id")
    .in("order_id", orderIds);
  if (linesErr) {
    console.error("FB FAVORITES lines:", linesErr);
    return NextResponse.json(
      { ok: false, error: linesErr.message },
      { status: 500 }
    );
  }

  // 3) Agregar por menu_item_id
  type Agg = { times: number; last: string };
  const aggByItem = new Map<string, Agg>();
  for (const l of (linesRaw ?? []) as Array<Record<string, unknown>>) {
    const itemId = String(l.menu_item_id);
    const ts = tsByOrder.get(String(l.order_id)) ?? "";
    const prev = aggByItem.get(itemId);
    if (prev) {
      prev.times += 1;
      if (ts > prev.last) prev.last = ts;
    } else {
      aggByItem.set(itemId, { times: 1, last: ts });
    }
  }
  if (aggByItem.size === 0) {
    return NextResponse.json({ ok: true, favorites: [] });
  }

  // 4) Cargar metadata de los items + categoría (necesario para emoji helper
  //    en el cliente). Solo items activos.
  const itemIds = Array.from(aggByItem.keys());
  const { data: itemsRaw } = await admin
    .from("fb_menu_items")
    .select(
      "id, name, price_cents, image_url, display_emoji, category_id, available_venue_ids, is_active"
    )
    .in("id", itemIds)
    .eq("is_active", true);

  // Cargar códigos de categoría
  const itemRows = (itemsRaw ?? []) as Array<Record<string, unknown>>;
  const catIds = Array.from(
    new Set(itemRows.map((r) => String(r.category_id)).filter(Boolean))
  );
  const catCodeById = new Map<string, string>();
  if (catIds.length > 0) {
    const { data: catsRaw } = await admin
      .from("fb_categories")
      .select("id, code")
      .in("id", catIds);
    for (const c of (catsRaw ?? []) as Array<Record<string, unknown>>) {
      catCodeById.set(String(c.id), String(c.code));
    }
  }

  // 5) Componer respuesta — filtrar por venue si se pidió
  const favorites: FavoriteResponse[] = [];
  for (const row of itemRows) {
    const id = String(row.id);
    const venues = Array.isArray(row.available_venue_ids)
      ? (row.available_venue_ids as string[])
      : [];
    if (venueId && !venues.includes(venueId)) continue;
    const agg = aggByItem.get(id);
    if (!agg) continue;
    favorites.push({
      menuItem: {
        id,
        name: String(row.name ?? ""),
        priceCents: Number(row.price_cents ?? 0),
        imageUrl: row.image_url ? String(row.image_url) : null,
        displayEmoji: row.display_emoji ? String(row.display_emoji) : null,
        categoryId: String(row.category_id ?? ""),
      },
      categoryCode: catCodeById.get(String(row.category_id)) ?? "",
      timesOrdered: agg.times,
      lastOrderedAt: agg.last,
    });
  }

  // Ordenar por frecuencia desc, desempate por más reciente
  favorites.sort((a, b) => {
    if (b.timesOrdered !== a.timesOrdered) return b.timesOrdered - a.timesOrdered;
    return b.lastOrderedAt.localeCompare(a.lastOrderedAt);
  });

  return NextResponse.json({
    ok: true,
    favorites: favorites.slice(0, MAX_FAVORITES),
  });
}
