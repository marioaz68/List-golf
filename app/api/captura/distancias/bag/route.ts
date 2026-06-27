import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  resolveContextFromCaddie,
  resolveContextFromEntry,
} from "@/lib/captura/positionFromActor";
import { resolveRitmoContext } from "@/lib/telegram/ritmo/handleLocationUpdate";
import type { PlayerBag } from "@/lib/distances/playerBag";

export const dynamic = "force-dynamic";

function norm(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function isPlayerBag(raw: unknown): raw is PlayerBag {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as { version?: unknown; clubs?: unknown };
  return o.version === 1 && Array.isArray(o.clubs);
}

async function resolveRoundAndCourse(
  admin: ReturnType<typeof createAdminClient>,
  entryId: string | null,
  caddieId: string | null,
  telegramUserId: string | null
): Promise<{ roundId: string | null; courseId: string | null; entryId: string | null }> {
  if (entryId) {
    const ctx = await resolveContextFromEntry(admin, entryId);
    if (ctx) {
      return {
        roundId: ctx.roundId,
        courseId: ctx.courseId,
        entryId,
      };
    }
    return { roundId: null, courseId: null, entryId };
  }
  if (caddieId) {
    const ctx = await resolveContextFromCaddie(admin, caddieId);
    if (ctx) {
      return {
        roundId: ctx.roundId,
        courseId: ctx.courseId,
        entryId: null,
      };
    }
  }
  if (telegramUserId) {
    const res = await resolveRitmoContext(admin, telegramUserId);
    if (res.status === "ok") {
      return {
        roundId: res.ctx.roundId,
        courseId: res.ctx.courseId,
        entryId: null,
      };
    }
  }
  return { roundId: null, courseId: null, entryId: null };
}

/** GET /api/captura/distancias/bag?scope_key= */
export async function GET(request: NextRequest) {
  const scopeKey = norm(request.nextUrl.searchParams.get("scope_key"));
  if (!scopeKey) {
    return NextResponse.json(
      { ok: false, error: "Falta scope_key." },
      { status: 400 }
    );
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
      {
        ok: true,
        payload: data.payload,
        updatedAt: data.updated_at,
        payloadVersion: data.payload_version,
      },
      { status: 200 }
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/** POST /api/captura/distancias/bag — guarda snapshot completo de la bolsa. */
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
    const resolved = await resolveRoundAndCourse(
      admin,
      entryId,
      caddieId,
      telegramUserId
    );

    const row = {
      scope_key: scopeKey,
      entry_id: resolved.entryId,
      caddie_id: caddieId,
      telegram_user_id: telegramUserId,
      round_id: resolved.roundId,
      course_id: resolved.courseId,
      payload,
      payload_version: 1,
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
