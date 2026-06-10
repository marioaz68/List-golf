/**
 * POST /api/captura/fb-order
 *
 * Crea un pedido (orden) F&B desde la Mini App.
 *
 * Body:
 *   {
 *     entry_id?: string         // jugador (opcional si caddie_id)
 *     caddie_id?: string        // caddie (opcional si entry_id)
 *     venue_id: string          // restaurante u carrito bar
 *     delivery_type: 'pickup' | 'on_course'
 *     requested_hole?: number   // requerido si delivery_type='on_course'
 *     notes?: string
 *     items: [{ menu_item_id, qty, notes? }]
 *   }
 *
 * GET /api/captura/fb-order?entry_id=...   o   ?caddie_id=...
 * Devuelve los pedidos activos + estado de cuenta acumulado del torneo
 * actual del cliente.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { smoothedHoleForGroup } from "@/lib/telegram/ritmo/paceCalculator";
import type { DeliveryType } from "@/lib/fb/types";

export const dynamic = "force-dynamic";

// ============================================================
// POST: crear nuevo pedido
// ============================================================
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "JSON inválido" },
      { status: 400 }
    );
  }

  const o = body as Record<string, unknown>;
  const norm = (v: unknown): string | null => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };

  const entryId = norm(o.entry_id);
  const caddieId = norm(o.caddie_id);
  const playerId = norm(o.player_id);
  const venueId = norm(o.venue_id);
  const deliveryType = String(o.delivery_type ?? "").trim() as DeliveryType;
  const requestedHole =
    typeof o.requested_hole === "number" ? o.requested_hole : null;
  const deliveryAddress = norm(o.delivery_address);
  const notes = norm(o.notes);
  const itemsInput = Array.isArray(o.items)
    ? (o.items as Array<Record<string, unknown>>)
    : [];

  if (!entryId && !caddieId && !playerId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id, caddie_id o player_id." },
      { status: 400 }
    );
  }
  if (!venueId) {
    return NextResponse.json(
      { ok: false, error: "Falta venue_id." },
      { status: 400 }
    );
  }
  if (
    deliveryType !== "pickup" &&
    deliveryType !== "on_course" &&
    deliveryType !== "home"
  ) {
    return NextResponse.json(
      { ok: false, error: "delivery_type inválido (pickup | on_course | home)." },
      { status: 400 }
    );
  }
  if (deliveryType === "home" && !deliveryAddress) {
    return NextResponse.json(
      {
        ok: false,
        error: "Para entregas a domicilio indica el domicilio (calle, número/lote).",
      },
      { status: 400 }
    );
  }
  if (itemsInput.length === 0) {
    return NextResponse.json(
      { ok: false, error: "El pedido no tiene items." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Resolver tournament_id + client_label + grupo (para detectar hoyo actual)
  let tournamentId: string | null = null;
  let clientLabel: string | null = null;
  let groupId: string | null = null;
  if (entryId) {
    const { data } = await admin
      .from("tournament_entries")
      .select("id, tournament_id, players ( first_name, last_name )")
      .eq("id", entryId)
      .maybeSingle();
    if (data) {
      tournamentId = (data as { tournament_id?: string }).tournament_id ?? null;
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
      // grupo activo
      const { data: gm } = await admin
        .from("pairing_group_members")
        .select("group_id")
        .eq("entry_id", entryId)
        .maybeSingle();
      groupId = (gm as { group_id?: string } | null)?.group_id ?? null;
    }
  } else if (playerId) {
    // Socio/residente pidiendo a domicilio (sin entry de torneo activo).
    const { data } = await admin
      .from("players")
      .select("id, first_name, last_name")
      .eq("id", playerId)
      .maybeSingle();
    if (data) {
      const p = data as { first_name?: string; last_name?: string };
      clientLabel =
        [p.first_name, p.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null;
    }
  } else if (caddieId) {
    const { data } = await admin
      .from("caddies")
      .select("id, first_name, last_name")
      .eq("id", caddieId)
      .maybeSingle();
    if (data) {
      const c = data as { first_name?: string; last_name?: string };
      clientLabel =
        [c.first_name, c.last_name]
          .map((s) => String(s ?? "").trim())
          .filter(Boolean)
          .join(" ") || null;
    }
    // tournament del caddie + grupo (via caddie_assignments activa)
    const { data: asg } = await admin
      .from("caddie_assignments")
      .select("tournament_id, pairing_group_id")
      .eq("caddie_id", caddieId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (asg) {
      tournamentId =
        (asg as { tournament_id?: string }).tournament_id ?? null;
      groupId =
        (asg as { pairing_group_id?: string }).pairing_group_id ?? null;
    }
  }

  // Hoyo actual (de GPS) — snapshot al momento del pedido
  let currentHole: number | null = null;
  if (groupId) {
    currentHole = await smoothedHoleForGroup(admin, groupId);
  }

  // Cargar precios reales del menú para no confiar en el cliente
  const itemIds = itemsInput
    .map((it) => String(it.menu_item_id ?? ""))
    .filter(Boolean);
  if (itemIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Items sin menu_item_id." },
      { status: 400 }
    );
  }

  // AUTO-REDIRECCIÓN POR INVENTARIO:
  // Si el venue es carrito y no tiene stock de alguno de los items, el
  // pedido se redirige al restaurante (Hoyo 6) para que se prepare allá
  // y el carrito vaya a recogerlo cuando esté listo. Esto es transparente
  // al cliente — su pedido entra normal, solo cambia de venue interno.
  let effectiveVenueId = venueId;
  let sourceVenueId: string | null = null;
  {
    const { data: venueData } = await admin
      .from("fb_venues")
      .select("id, type, code")
      .eq("id", venueId)
      .maybeSingle();
    const venueRow = venueData as { type?: string; code?: string } | null;
    if (venueRow?.type === "cart") {
      // Buscar stock del carrito para todos los items pedidos
      const { data: stockRows } = await admin
        .from("fb_venue_stock")
        .select("menu_item_id, qty_available")
        .eq("venue_id", venueId)
        .in("menu_item_id", itemIds);
      const stockMap = new Map<string, number>();
      for (const s of (stockRows ?? []) as Array<{ menu_item_id: string; qty_available: number }>) {
        stockMap.set(s.menu_item_id, s.qty_available);
      }
      // Si CUALQUIER item tiene fila con stock 0 → redirigir todo al restaurante
      // (decisión simple: o todo lo entrega el carrito o todo el restaurante)
      let needsRedirect = false;
      for (const it of itemsInput) {
        const id = String(it.menu_item_id ?? "");
        const wanted = Number(it.qty ?? 0);
        const available = stockMap.get(id);
        // Solo redirige si tiene fila Y el stock es insuficiente
        // (sin fila = stock infinito, default)
        if (available != null && available < wanted) {
          needsRedirect = true;
          break;
        }
      }
      if (needsRedirect) {
        const { data: h6 } = await admin
          .from("fb_venues")
          .select("id")
          .eq("code", "h6")
          .eq("is_active", true)
          .maybeSingle();
        if (h6) {
          sourceVenueId = venueId;
          effectiveVenueId = (h6 as { id: string }).id;
        }
      }
    }
  }

  const { data: priceRows, error: priceErr } = await admin
    .from("fb_menu_items")
    .select("id, name, price_cents, available_venue_ids, is_active")
    .in("id", itemIds);
  if (priceErr) {
    console.error("FB ORDER price lookup:", priceErr);
    return NextResponse.json(
      { ok: false, error: "Error consultando precios" },
      { status: 500 }
    );
  }
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

  // Validar cada item del pedido
  type LineInput = { menuItemId: string; qty: number; notes: string | null };
  const lines: LineInput[] = [];
  let totalCents = 0;
  for (const it of itemsInput) {
    const menuItemId = String(it.menu_item_id ?? "").trim();
    const qty = Number(it.qty ?? 0);
    const lineNotes = it.notes ? String(it.notes).trim() : null;
    if (!menuItemId || !Number.isFinite(qty) || qty <= 0) continue;
    const ref = priceMap.get(menuItemId);
    if (!ref || !ref.active) {
      return NextResponse.json(
        { ok: false, error: `Item ${menuItemId} no disponible.` },
        { status: 400 }
      );
    }
    // Validar disponibilidad contra el venue ELEGIDO POR EL CLIENTE
    // (no el effectiveVenueId; queremos que el menú del carrito sea válido
    // aunque el sistema acabe redirigiendo al restaurante por stock).
    if (!ref.venues.includes(venueId)) {
      return NextResponse.json(
        { ok: false, error: `"${ref.name}" no se sirve en este venue.` },
        { status: 400 }
      );
    }
    lines.push({ menuItemId, qty: Math.floor(qty), notes: lineNotes });
    totalCents += ref.priceCents * Math.floor(qty);
  }
  if (lines.length === 0) {
    return NextResponse.json(
      { ok: false, error: "Sin items válidos en el pedido." },
      { status: 400 }
    );
  }

  // Insertar la orden + items en una transacción lógica
  // venue_id = donde se prepara (puede ser el restaurante si hubo redirección)
  // source_venue_id = el venue ORIGINAL al que pidió (carrito), si fue redirigido
  const { data: orderRow, error: orderErr } = await admin
    .from("fb_orders")
    .insert({
      tournament_id: tournamentId,
      entry_id: entryId,
      caddie_id: caddieId,
      player_id: playerId,
      client_label: clientLabel,
      venue_id: effectiveVenueId,
      source_venue_id: sourceVenueId,
      delivery_type: deliveryType,
      status: "pending",
      requested_hole:
        deliveryType === "on_course" ? requestedHole ?? currentHole : null,
      delivery_address: deliveryType === "home" ? deliveryAddress : null,
      current_hole_at_order: currentHole,
      total_cents: totalCents,
      notes,
    })
    .select("id, created_at")
    .single();
  if (orderErr || !orderRow) {
    console.error("FB ORDER insert:", orderErr);
    return NextResponse.json(
      { ok: false, error: orderErr?.message ?? "Error creando pedido" },
      { status: 500 }
    );
  }

  const orderId = (orderRow as { id: string }).id;
  const lineRows = lines.map((l) => {
    const ref = priceMap.get(l.menuItemId)!;
    return {
      order_id: orderId,
      menu_item_id: l.menuItemId,
      qty: l.qty,
      unit_price_cents: ref.priceCents,
      item_name_snapshot: ref.name,
      notes: l.notes,
    };
  });
  const { error: itemsErr } = await admin
    .from("fb_order_items")
    .insert(lineRows);
  if (itemsErr) {
    // rollback manual: borrar la orden si fallaron las líneas
    await admin.from("fb_orders").delete().eq("id", orderId);
    console.error("FB ORDER items insert:", itemsErr);
    return NextResponse.json(
      { ok: false, error: itemsErr.message },
      { status: 500 }
    );
  }

  // Reparto a domicilio: guardar el domicilio en el perfil del cliente y
  // marcarlo como residente del fraccionamiento (para reusarlo y que aparezca
  // en la pantalla "Fraccionamiento" del backoffice).
  if (deliveryType === "home" && deliveryAddress) {
    const targetPlayerId =
      playerId ??
      (entryId
        ? (
            await admin
              .from("tournament_entries")
              .select("player_id")
              .eq("id", entryId)
              .maybeSingle()
          ).data?.player_id ?? null
        : null);
    if (targetPlayerId) {
      await admin
        .from("players")
        .update({ address: deliveryAddress, is_resident: true })
        .eq("id", targetPlayerId);
    }
  }

  return NextResponse.json({
    ok: true,
    order_id: orderId,
    total_cents: totalCents,
    current_hole: currentHole,
    requested_hole:
      deliveryType === "on_course" ? requestedHole ?? currentHole : null,
  });
}

// ============================================================
// GET: pedidos del cliente + total acumulado en el torneo
// ============================================================
export async function GET(req: Request) {
  const url = new URL(req.url);
  const entryId = url.searchParams.get("entry_id")?.trim() || null;
  const caddieId = url.searchParams.get("caddie_id")?.trim() || null;
  const playerId = url.searchParams.get("player_id")?.trim() || null;

  if (!entryId && !caddieId && !playerId) {
    return NextResponse.json(
      { ok: false, error: "Falta entry_id, caddie_id o player_id." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let q = admin
    .from("fb_orders")
    .select(
      "id, venue_id, delivery_type, status, requested_hole, delivery_address, total_cents, notes, created_at, ready_at, delivered_at, tournament_id, fb_order_items ( id, menu_item_id, qty, unit_price_cents, item_name_snapshot, notes )"
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (entryId) q = q.eq("entry_id", entryId);
  else if (caddieId) q = q.eq("caddie_id", caddieId);
  else if (playerId) q = q.eq("player_id", playerId);

  const { data, error } = await q;
  if (error) {
    console.error("FB ORDER list:", error);
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }

  const orders = (data ?? []) as Array<Record<string, unknown>>;
  // Total acumulado en el torneo actual (no cancelados)
  let accountTotalCents = 0;
  let currentTournamentId: string | null = null;
  for (const ord of orders) {
    if (ord.tournament_id && !currentTournamentId) {
      currentTournamentId = String(ord.tournament_id);
    }
  }
  // La cuenta acumulada solo incluye pedidos YA CONFIRMADOS por el cliente
  // (status='delivered'). Los que aún están en proceso o esperando
  // confirmación NO suman hasta que el cliente acepte. Los disputados
  // tampoco suman (los resuelve el comité).
  for (const ord of orders) {
    if (
      ord.tournament_id === currentTournamentId &&
      ord.status === "delivered"
    ) {
      accountTotalCents += Number(ord.total_cents ?? 0);
    }
  }

  return NextResponse.json({
    ok: true,
    orders,
    account: {
      tournament_id: currentTournamentId,
      total_cents: accountTotalCents,
    },
  });
}
