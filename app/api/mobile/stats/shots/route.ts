/**
 * POST /api/mobile/stats/shots
 *
 * Lista TODOS los tiros de un bastón + tipo de swing (para el drill-down).
 * Cada tiro incluye su `shot_id` y si está excluido del promedio.
 *
 * Body: { initData: string, club: string, swing: "full" | "three_quarter" }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePlayerId } from "@/lib/mobile/resolvePlayer";

export const dynamic = "force-dynamic";

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const normSwing = (s: string | null): "full" | "three_quarter" =>
  s === "three_quarter" ? "three_quarter" : "full";

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const b = body as { initData?: unknown; club?: unknown; swing?: unknown };
  const initData = String(b.initData ?? "");
  const club = String(b.club ?? "");
  const swing = normSwing(b.swing === "three_quarter" ? "three_quarter" : "full");
  if (!club) return NextResponse.json({ ok: false, error: "Falta club" }, { status: 400 });

  const admin = createAdminClient();
  const who = await resolvePlayerId(admin, initData);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const playerId = who.playerId;

  const [shotsRes, exRes] = await Promise.all([
    admin
      .from("v_yardage_shots")
      .select("shot_id, hole, stroke_no, swing, actual_yards, planned_yards, completed_at")
      .eq("player_id", playerId)
      .eq("club", club)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(2000),
    admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId),
  ]);

  if (shotsRes.error) {
    console.error("MOBILE STATS shots:", shotsRes.error);
    return NextResponse.json({ ok: false, error: "Error consultando tiros" }, { status: 500 });
  }
  const excluded = new Set((exRes.data ?? []).map((r) => (r as { shot_id: string }).shot_id));

  const shots = (shotsRes.data ?? [])
    .filter((r) => normSwing((r as { swing: string | null }).swing) === swing)
    .map((r) => {
      const row = r as Record<string, unknown>;
      const shotId = String(row.shot_id ?? "");
      return {
        shot_id: shotId,
        hole: n(row.hole) ?? 0,
        stroke_no: n(row.stroke_no) ?? 0,
        actual_yards: n(row.actual_yards),
        planned_yards: n(row.planned_yards),
        completed_at: (row.completed_at as string | null) ?? null,
        excluded: excluded.has(shotId),
      };
    });

  return NextResponse.json({ ok: true, club, swing, shots });
}
