import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadPaceForActor } from "@/lib/distances/loadPaceForActor";

export const dynamic = "force-dynamic";

/**
 * GET /api/captura/distancias/pace?entry_id=&caddie_id=&tg=&hole=
 * Ritmo de juego del jugador/caddie para el semáforo en la mini app de yardas.
 */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const norm = (v: string | null): string | null => {
    const s = String(v ?? "").trim();
    return s ? s : null;
  };
  const entryId = norm(sp.get("entry_id")) ?? norm(sp.get("me"));
  const caddieId = norm(sp.get("caddie_id")) ?? norm(sp.get("caddie"));
  const telegramUserId = norm(sp.get("tg"));
  const holeRaw = norm(sp.get("hole"));
  const hole = holeRaw != null ? Number(holeRaw) : null;

  if (!entryId && !caddieId && !telegramUserId) {
    return NextResponse.json(
      { ok: false, status: "no_actor", color: "none" },
      { status: 200 }
    );
  }

  try {
    const admin = createAdminClient();
    const result = await loadPaceForActor(admin, {
      entryId,
      caddieId,
      telegramUserId,
      hole: hole != null && Number.isFinite(hole) ? hole : null,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(
      { ok: false, status: "error", color: "none", message: msg },
      { status: 200 }
    );
  }
}
