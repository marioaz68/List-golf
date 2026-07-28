import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  resolveContextFromCaddie,
  resolveContextFromEntry,
} from "@/lib/captura/positionFromActor";
import { resolveRitmoContext } from "@/lib/telegram/ritmo/handleLocationUpdate";
import {
  mergeHoleShotsStores,
  type HoleShotsStore,
} from "@/lib/distances/holeShots";

export const dynamic = "force-dynamic";

function norm(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function isHoleShotsStore(raw: unknown): raw is HoleShotsStore {
  if (!raw || typeof raw !== "object") return false;
  const o = raw as { byHole?: unknown; version?: unknown };
  return o.byHole != null && typeof o.byHole === "object";
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

/** Llave canonica POR JUGADOR: si hay entry_id, todos sus dispositivos
 *  (telefono/iPad/caddie con me=) comparten la misma fila. Si no,
 *  cae a la llave del dispositivo (comportamiento anterior). */
function canonicalScopeKey(entryId: string | null, fallback: string): string {
  return entryId ? `entry:${entryId}` : fallback;
}

/** GET /api/captura/distancias/shots?scope_key= */
export async function GET(request: NextRequest) {
  const scopeKey = norm(request.nextUrl.searchParams.get("scope_key"));
  if (!scopeKey) {
    return NextResponse.json(
      { ok: false, error: "Falta scope_key." },
      { status: 400 }
    );
  }

  const entryIdParam = norm(request.nextUrl.searchParams.get("entry_id"));
  const readKey = canonicalScopeKey(entryIdParam, scopeKey);

  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("yardage_shot_logs")
      .select("payload, updated_at, payload_version")
      .eq("scope_key", readKey)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    if (!data?.payload || !isHoleShotsStore(data.payload)) {
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

/** POST /api/captura/distancias/shots — guarda snapshot completo para estadísticas. */
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
  if (!isHoleShotsStore(payload)) {
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

    const canonicalKey = canonicalScopeKey(entryId, scopeKey);

    // Fusion en servidor: no pisar los golpes de otro dispositivo del
    // mismo jugador. Leemos lo que hay, lo unimos y guardamos.
    let merged: HoleShotsStore = payload;
    const { data: existing } = await admin
      .from("yardage_shot_logs")
      .select("payload")
      .eq("scope_key", canonicalKey)
      .maybeSingle();
    if (existing?.payload && isHoleShotsStore(existing.payload)) {
      merged = mergeHoleShotsStores(existing.payload, payload);
    }

    const row = {
      scope_key: canonicalKey,
      entry_id: resolved.entryId,
      caddie_id: caddieId,
      telegram_user_id: telegramUserId,
      round_id: resolved.roundId,
      course_id: resolved.courseId,
      payload: merged,
      payload_version:
        typeof merged.version === "number" ? merged.version : 2,
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin
      .from("yardage_shot_logs")
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
