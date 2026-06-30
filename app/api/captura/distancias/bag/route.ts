import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import type { PlayerBag } from "@/lib/distances/playerBag";

export const dynamic = "force-dynamic";

function norm(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function isPlayerBag(raw: unknown): raw is PlayerBag {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as { clubs?: unknown };
  return Array.isArray(o.clubs);
}

/** GET /api/captura/distancias/bag?scope_key= — bolsa guardada del jugador. */
export async function GET(request: NextRequest) {
  const scopeKey = norm(request.nextUrl.searchParams.get("scope_key"));
  if (!scopeKey) {
    return NextResponse.json({ ok: false, error: "Falta scope_key." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("yardage_player_bags")
      .select("payload, updated_at, payload_version")
      .eq("scope_key", scopeKey)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data?.payload || !isPlayerBag(data.payload)) {
      return NextResponse.json({ ok: true, payload: null }, { status: 200 });
    }

    return NextResponse.json(
      { ok: true, payload: data.payload, updatedAt: data.updated_at },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** POST /api/captura/distancias/bag — guarda la bolsa del jugador (alta/edición). */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const scopeKey = norm(String(o.scope_key ?? ""));
  const payload = o.payload;

  if (!scopeKey) {
    return NextResponse.json({ ok: false, error: "Falta scope_key." }, { status: 400 });
  }
  if (!isPlayerBag(payload)) {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const entryId = norm(String(o.entry_id ?? ""));
  const caddieId = norm(String(o.caddie_id ?? ""));
  const telegramRaw = norm(String(o.telegram_user_id ?? ""));
  const telegramUserId =
    telegramRaw && /^\d+$/.test(telegramRaw) ? telegramRaw : null;

  try {
    const admin = createAdminClient();
    const row = {
      scope_key: scopeKey,
      entry_id: entryId,
      caddie_id: caddieId,
      telegram_user_id: telegramUserId,
      payload,
      payload_version:
        typeof (payload as PlayerBag).version === "number"
          ? (payload as PlayerBag).version
          : 1,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin
      .from("yardage_player_bags")
      .upsert(row, { onConflict: "scope_key" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
