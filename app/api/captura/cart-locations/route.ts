/**
 * GET /api/captura/cart-locations
 *
 * Devuelve la última ubicación conocida de cada carrito bar activo
 * (últimos 15 min). Lo consume el cliente en /captura/menu para mostrar
 * "🚚 Carrito en hoyo X · ETA a ti N min" cuando selecciona un venue
 * tipo cart.
 *
 * Query: ?my_hole=N (opcional) para calcular ETA al hoyo del cliente.
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FRESH_MIN = 15;

interface CartLocation {
  venueId: string;
  venueName: string;
  currentHole: number | null;
  lastSeenAgoMin: number | null;
  etaMinToMyHole: number | null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const myHoleParam = url.searchParams.get("my_hole");
  const myHole = myHoleParam ? Number(myHoleParam) : null;

  const admin = createAdminClient();

  // Cargar venues tipo cart activos
  const { data: vs } = await admin
    .from("fb_venues")
    .select("id, name")
    .eq("type", "cart")
    .eq("is_active", true);
  const venues = (vs ?? []) as Array<{ id: string; name: string }>;
  if (venues.length === 0) {
    return NextResponse.json({ ok: true, carts: [] });
  }

  // Últimos pings de los últimos 15 min para esos venues
  const cutoff = new Date(Date.now() - FRESH_MIN * 60 * 1000).toISOString();
  const { data: pings } = await admin
    .from("ritmo_positions")
    .select("fb_venue_id, hoyo_detectado, ts")
    .in("fb_venue_id", venues.map((v) => v.id))
    .gte("ts", cutoff)
    .order("ts", { ascending: false });

  // Por venue, calcular moda de hoyo en últimos 10 pings + último timestamp
  type Agg = { hoyos: number[]; lastTs: string };
  const byVenue = new Map<string, Agg>();
  for (const p of (pings ?? []) as Array<{
    fb_venue_id: string;
    hoyo_detectado: number | null;
    ts: string;
  }>) {
    const arr = byVenue.get(p.fb_venue_id) ?? { hoyos: [], lastTs: p.ts };
    if (arr.hoyos.length < 10 && p.hoyo_detectado != null) {
      arr.hoyos.push(p.hoyo_detectado);
    }
    byVenue.set(p.fb_venue_id, arr);
  }

  const MIN_POR_HOYO = 15;
  function eta(from: number, to: number): number {
    if (from === to) return 0;
    let diff = to - from;
    if (diff < 0) diff += 18;
    return diff * MIN_POR_HOYO;
  }

  const now = Date.now();
  const carts: CartLocation[] = venues.map((v) => {
    const agg = byVenue.get(v.id);
    let currentHole: number | null = null;
    let lastSeenAgoMin: number | null = null;
    if (agg && agg.hoyos.length > 0) {
      const counts = new Map<number, number>();
      for (const h of agg.hoyos) counts.set(h, (counts.get(h) ?? 0) + 1);
      let best = 0;
      for (const [h, c] of counts) {
        if (c > best) {
          best = c;
          currentHole = h;
        }
      }
      lastSeenAgoMin = Math.round((now - new Date(agg.lastTs).getTime()) / 60000);
    }
    const etaMinToMyHole =
      myHole != null && currentHole != null ? eta(currentHole, myHole) : null;
    return {
      venueId: v.id,
      venueName: v.name,
      currentHole,
      lastSeenAgoMin,
      etaMinToMyHole,
    };
  });

  return NextResponse.json({ ok: true, carts });
}
