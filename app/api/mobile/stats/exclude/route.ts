/**
 * POST /api/mobile/stats/exclude
 *
 * Marca o desmarca un tiro como EXCLUIDO del promedio (reversible, no borra).
 *
 * Body: { initData: string, shotId: string, excluded: boolean }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePlayerId } from "@/lib/mobile/resolvePlayer";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const b = body as { initData?: unknown; shotId?: unknown; excluded?: unknown };
  const initData = String(b.initData ?? "");
  const shotId = String(b.shotId ?? "");
  const excluded = Boolean(b.excluded);
  if (!shotId) return NextResponse.json({ ok: false, error: "Falta shotId" }, { status: 400 });

  const admin = createAdminClient();
  const who = await resolvePlayerId(admin, initData);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });

  if (excluded) {
    const { error } = await admin
      .from("yardage_excluded_shots")
      .upsert({ player_id: who.playerId, shot_id: shotId }, { onConflict: "player_id,shot_id" });
    if (error) {
      console.error("MOBILE exclude upsert:", error);
      return NextResponse.json({ ok: false, error: "No se pudo excluir" }, { status: 500 });
    }
  } else {
    const { error } = await admin
      .from("yardage_excluded_shots")
      .delete()
      .eq("player_id", who.playerId)
      .eq("shot_id", shotId);
    if (error) {
      console.error("MOBILE exclude delete:", error);
      return NextResponse.json({ ok: false, error: "No se pudo reincluir" }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, shotId, excluded });
}
