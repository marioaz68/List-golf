/**
 * POST /api/mobile/stats/green-map
 *
 * Para un hoyo: geometría del green (frente/centro/fondo) y las posiciones
 * históricas donde quedó la bola del tiro de APPROACH (el último golpe sin
 * putt del hoyo: par 3 = 1er tiro, par 4 = 2º, par 5 = 3º o 2º si sube en 2).
 *
 * Body: { initData, hole, from?, to?, last? }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePlayerId } from "@/lib/mobile/resolvePlayer";

export const dynamic = "force-dynamic";

const nnum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

type Row = { round_id: string | null; course_id: string | null; stroke_no: number | null; club: string | null; to_lat: number | null; to_lon: number | null; completed_at: string | null; shot_id: string };

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const b = body as { initData?: unknown; hole?: unknown; from?: unknown; to?: unknown; last?: unknown };
  const initData = String(b.initData ?? "");
  const hole = Number(b.hole);
  let from = b.from ? String(b.from) : null;
  let to = b.to ? String(b.to) : null;
  const lastRound = Boolean(b.last);
  if (!Number.isFinite(hole)) return NextResponse.json({ ok: false, error: "Falta hoyo" }, { status: 400 });

  const admin = createAdminClient();
  const who = await resolvePlayerId(admin, initData);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const playerId = who.playerId;

  if (lastRound) {
    const { data: lastRow } = await admin.from("v_yardage_shots").select("completed_at").eq("player_id", playerId)
      .order("completed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const iso = (lastRow as { completed_at?: string | null } | null)?.completed_at;
    if (iso) { const d = new Date(iso); const s = new Date(d); s.setHours(0, 0, 0, 0); const e = new Date(d); e.setHours(23, 59, 59, 999); from = s.toISOString(); to = e.toISOString(); }
  }

  let q = admin.from("v_yardage_shots")
    .select("round_id, course_id, stroke_no, club, to_lat, to_lon, completed_at, shot_id")
    .eq("player_id", playerId).eq("hole", hole);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(6000);
  if (error) { console.error("GREEN-MAP:", error); return NextResponse.json({ ok: false, error: "Error consultando tiros" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

  const { data: exRows } = await admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  // curso + par + geometría del green
  const courseCount = new Map<string, number>();
  for (const r of rows) if (r.course_id) courseCount.set(r.course_id, (courseCount.get(r.course_id) ?? 0) + 1);
  const courseId = [...courseCount.entries()].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? null;
  let green: { center?: { lat: number; lon: number }; front?: { lat: number; lon: number }; back?: { lat: number; lon: number } } = {};
  let par: number | null = null;
  if (courseId) {
    const { data: ch } = await admin.from("course_holes")
      .select("par, green_center_lat, green_center_lon, green_front_lat, green_front_lon, green_back_lat, green_back_lon")
      .eq("course_id", courseId).eq("hole_number", hole).maybeSingle();
    const c = ch as Record<string, number | null> | null;
    if (c) {
      par = c.par ?? null;
      if (c.green_center_lat != null && c.green_center_lon != null) green.center = { lat: c.green_center_lat, lon: c.green_center_lon };
      if (c.green_front_lat != null && c.green_front_lon != null) green.front = { lat: c.green_front_lat, lon: c.green_front_lon };
      if (c.green_back_lat != null && c.green_back_lon != null) green.back = { lat: c.green_back_lat, lon: c.green_back_lon };
    }
  }

  // último golpe sin putt por ronda -> posición de la bola del approach
  const byRound = new Map<string, Row[]>();
  for (const r of rows) {
    const rk = r.round_id ?? "r";
    (byRound.get(rk) ?? byRound.set(rk, []).get(rk)!).push(r);
  }
  const balls: Array<{ lat: number; lon: number; date: string | null; gir: boolean }> = [];
  for (const list of byRound.values()) {
    const nonPutt = list.filter((r) => r.club && r.club !== "putter" && r.club !== "penalty" && !excluded.has(r.shot_id));
    if (!nonPutt.length) continue;
    nonPutt.sort((a, b2) => (a.stroke_no ?? 0) - (b2.stroke_no ?? 0));
    const approach = nonPutt[nonPutt.length - 1];
    if (approach.to_lat == null || approach.to_lon == null) continue;
    const gir = par != null ? nonPutt.length <= par - 2 : false;
    balls.push({ lat: approach.to_lat, lon: approach.to_lon, date: approach.completed_at, gir });
  }

  return NextResponse.json({ ok: true, hole, par, green, balls });
}
