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

/**
 * Llave ESTABLE de la bolsa por jugador. La bolsa pertenece a la persona, no
 * a la ronda: por eso normalizamos entry_id/telegram al player_id subyacente y
 * usamos `player:{id}`. Así la misma bolsa se reusa entre torneos y rondas
 * diarias. Si no se resuelve jugador (p. ej. caddie), devolvemos null y el
 * llamador usa la scope_key original.
 */
async function resolvePlayerBagKey(
  admin: ReturnType<typeof createAdminClient>,
  ids: { entryId: string | null; telegramUserId: string | null }
): Promise<string | null> {
  if (ids.entryId) {
    const { data } = await admin
      .from("tournament_entries")
      .select("player_id")
      .eq("id", ids.entryId)
      .maybeSingle();
    const pid = (data as { player_id?: string | null } | null)?.player_id;
    if (pid) return `player:${pid}`;
  }
  if (ids.telegramUserId) {
    const { data } = await admin
      .from("players")
      .select("id")
      .eq("telegram_user_id", ids.telegramUserId)
      .maybeSingle();
    const pid = (data as { id?: string | null } | null)?.id;
    if (pid) return `player:${pid}`;
  }
  return null;
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

  const entryId = norm(request.nextUrl.searchParams.get("entry_id"));
  const telegramRaw = norm(request.nextUrl.searchParams.get("telegram_user_id"));
  const telegramUserId =
    telegramRaw && /^\d+$/.test(telegramRaw) ? telegramRaw : null;

  try {
    const admin = createAdminClient();

    // Buscar primero por la llave estable de jugador; si no hay, por la
    // scope_key original (compatibilidad con bolsas guardadas antes).
    const playerKey = await resolvePlayerBagKey(admin, { entryId, telegramUserId });
    const keysToTry = playerKey ? [playerKey, scopeKey] : [scopeKey];

    for (const key of keysToTry) {
      const { data, error } = await admin
        .from("yardage_player_bags")
        .select("payload, updated_at, payload_version")
        .eq("scope_key", key)
        .maybeSingle();
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      if (data?.payload && isPlayerBag(data.payload)) {
        return NextResponse.json(
          {
            ok: true,
            payload: data.payload,
            updatedAt: data.updated_at,
            payloadVersion: data.payload_version,
          },
          { status: 200 }
        );
      }
    }

    return NextResponse.json({ ok: true, payload: null }, { status: 200 });
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

    // Guardar bajo la llave ESTABLE de jugador cuando se pueda resolver, para
    // que la bolsa persista entre rondas/torneos. Si no (caddie u otro), se usa
    // la scope_key original.
    const playerKey = await resolvePlayerBagKey(admin, { entryId, telegramUserId });
    const effectiveKey = playerKey ?? scopeKey;

    const row = {
      scope_key: effectiveKey,
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
