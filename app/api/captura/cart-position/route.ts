/**
 * POST /api/captura/cart-position
 *
 * Recibe pings GPS del carrito bar. El operador mantiene la Mini App
 * `/captura/carrito?venue=XXX` abierta en su celular, y el chip GPS
 * envía la ubicación a este endpoint.
 *
 * Body: { venue_id, lat, lon, accuracy? }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";

export const dynamic = "force-dynamic";

const MAX_ACCURACY_M = 30;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const venueId = String(o.venue_id ?? "").trim();
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  const accuracy =
    o.accuracy != null && Number.isFinite(Number(o.accuracy))
      ? Number(o.accuracy)
      : null;

  if (!venueId) {
    return NextResponse.json(
      { ok: false, error: "Falta venue_id del carrito." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { ok: false, error: "lat/lon inválidos." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Verificar que el venue exista y sea de tipo 'cart'
  const { data: venue } = await admin
    .from("fb_venues")
    .select("id, type, name")
    .eq("id", venueId)
    .maybeSingle();
  if (!venue) {
    return NextResponse.json(
      { ok: false, error: "Venue no encontrado." },
      { status: 404 }
    );
  }
  if ((venue as { type?: string }).type !== "cart") {
    return NextResponse.json(
      { ok: false, error: "Este endpoint es solo para carritos." },
      { status: 400 }
    );
  }

  // Detección de hoyo: asumimos CCQ por ahora (el carrito circula ahí).
  // En el futuro se puede pasar courseId desde el venue o desde el contexto.
  const noisy = accuracy != null && accuracy > MAX_ACCURACY_M;
  const holes = getCourseHoles("Club Campestre de Querétaro");
  const hoyo = !noisy && holes ? detectHole({ lat, lon }, holes) : null;

  const { error } = await admin.from("ritmo_positions").insert({
    fb_venue_id: venueId,
    lat,
    lon,
    hoyo_detectado: hoyo,
    is_live_update: true,
  });
  if (error) {
    console.error("CART POSITION insert:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, hoyo });
}
