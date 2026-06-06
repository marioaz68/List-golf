/**
 * POST /api/mobile/auth/redeem
 *
 * Recibe un código de 4-8 dígitos generado por el bot @ListGolfBot. Si está
 * vigente, lo consume y devuelve el caddie_id / entry_id del usuario para
 * que la app guarde la sesión.
 *
 * One-time: al validar, marca el código como consumido para que no se
 * reuse. La app guarda los UUIDs en SecureStore.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

interface CodeRow {
  id: string;
  caddie_id: string | null;
  player_id: string | null;
  entry_id: string | null;
  display_name: string | null;
  expires_at: string;
  consumed_at: string | null;
}

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

  const code = String((body as { code?: unknown }).code ?? "").trim();
  if (!/^\d{4,8}$/.test(code)) {
    return NextResponse.json(
      { ok: false, error: "Código inválido (4-8 dígitos)." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("mobile_auth_codes")
    .select("id, caddie_id, player_id, entry_id, display_name, expires_at, consumed_at")
    .eq("code", code)
    .is("consumed_at", null)
    .maybeSingle();

  if (error) {
    console.error("MOBILE REDEEM lookup:", error);
    return NextResponse.json(
      { ok: false, error: "Error consultando código" },
      { status: 500 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { ok: false, error: "Código no encontrado o ya usado." },
      { status: 404 }
    );
  }

  const row = data as CodeRow;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "El código expiró. Pide uno nuevo al bot." },
      { status: 410 }
    );
  }

  // Consumir: marcar como usado para que no se reuse.
  const { error: consumeErr } = await admin
    .from("mobile_auth_codes")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", row.id);
  if (consumeErr) {
    console.error("MOBILE REDEEM consume:", consumeErr);
    return NextResponse.json(
      { ok: false, error: "Error consumiendo código" },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    caddieId: row.caddie_id,
    entryId: row.entry_id, // entry_id si es jugador (no player_id directo)
    displayName: row.display_name,
  });
}
