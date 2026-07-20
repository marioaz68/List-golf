/**
 * POST /api/mobile/stats/exclude-hole
 *
 * Excluye/incluye una JUGADA de hoyo (round_key + hole) de los promedios.
 *
 * Body: { initData, roundKey, hole, excluded }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePlayerId } from "@/lib/mobile/resolvePlayer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const b = body as { initData?: unknown; roundKey?: unknown; hole?: unknown; excluded?: unknown };
  const initData = String(b.initData ?? "");
  const roundKey = String(b.roundKey ?? "");
  const hole = Number(b.hole);
  const excluded = Boolean(b.excluded);
  if (!roundKey || !Number.isFinite(hole)) return NextResponse.json({ ok: false, error: "Datos incompletos" }, { status: 400 });

  const admin = createAdminClient();
  const who = await resolvePlayerId(admin, initData);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  if (excluded) {
    const { error } = await admin
      .from("yardage_excluded_holes")
      .upsert({ player_id: who.playerId, round_key: roundKey, hole }, { onConflict: "player_id,round_key,hole" });
    if (error) { console.error("exclude-hole upsert:", error); return NextResponse.json({ ok: false, error: "No se pudo excluir" }, { status: 500 }); }
  } else {
    const { error } = await admin
      .from("yardage_excluded_holes")
      .delete()
      .eq("player_id", who.playerId).eq("round_key", roundKey).eq("hole", hole);
    if (error) { console.error("exclude-hole delete:", error); return NextResponse.json({ ok: false, error: "No se pudo reincluir" }, { status: 500 }); }
  }
  return NextResponse.json({ ok: true });
}
