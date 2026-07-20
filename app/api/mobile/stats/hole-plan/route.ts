/**
 * POST /api/mobile/stats/hole-plan
 *
 * Sugiere un PLAN de bastones para el hoyo: distancia real desde donde sueles
 * salir hasta la bandera del día (o el centro del green), y una secuencia de
 * bastones cuyas yardas SUMAN esa distancia, mostrando las yardas de cada uno.
 *
 * Body: { initData, hole, from?, to?, last? }
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

function yards(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLon = (bLon - aLon) * Math.PI / 180;
  const la1 = aLat * Math.PI / 180, la2 = bLat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  const m = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  return m * 1.09361;
}

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
    const { data: lastRow } = await admin
      .from("v_yardage_shots").select("completed_at").eq("player_id", playerId)
      .order("completed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const iso = (lastRow as { completed_at?: string | null } | null)?.completed_at;
    if (iso) { const d = new Date(iso); const s = new Date(d); s.setHours(0, 0, 0, 0); const e = new Date(d); e.setHours(23, 59, 59, 999); from = s.toISOString(); to = e.toISOString(); }
  }

  // Tiros del hoyo (para el tee real y el bastón más constante de salida).
  let q = admin.from("v_yardage_shots")
    .select("round_id, course_id, stroke_no, club, lie_kind, from_lat, from_lon")
    .eq("player_id", playerId).eq("hole", hole);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data: shotData } = await q.limit(5000);
  const shots = (shotData ?? []) as Array<{ round_id: string | null; course_id: string | null; stroke_no: number | null; club: string | null; lie_kind: string | null; from_lat: number | null; from_lon: number | null }>;

  // Curso más frecuente.
  const courseCount = new Map<string, number>();
  for (const s of shots) if (s.course_id) courseCount.set(s.course_id, (courseCount.get(s.course_id) ?? 0) + 1);
  const courseId = [...courseCount.entries()].sort((a, b2) => b2[1] - a[1])[0]?.[0] ?? null;

  // Tee: promedio de las salidas (stroke 1) reales del jugador.
  const tees = shots.filter((s) => s.stroke_no === 1 && s.from_lat != null && s.from_lon != null);
  let teeLat: number | null = null, teeLon: number | null = null;
  if (tees.length) {
    teeLat = tees.reduce((a, s) => a + (s.from_lat as number), 0) / tees.length;
    teeLon = tees.reduce((a, s) => a + (s.from_lon as number), 0) / tees.length;
  } else if (courseId) {
    const { data: tp } = await admin.from("course_hole_tee_positions").select("lat, lon").eq("course_id", courseId).eq("hole_number", hole).limit(1).maybeSingle();
    const t = tp as { lat: number | null; lon: number | null } | null;
    if (t?.lat != null && t?.lon != null) { teeLat = t.lat; teeLon = t.lon; }
  }

  // Objetivo: bandera del día si existe, si no el centro del green.
  let targetLat: number | null = null, targetLon: number | null = null, targetType = "green";
  let par: number | null = null;
  if (courseId) {
    const { data: fl } = await admin.from("course_hole_flag_positions")
      .select("lat, lon, effective_date, created_at").eq("course_id", courseId).eq("hole_number", hole)
      .order("effective_date", { ascending: false, nullsFirst: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const flag = fl as { lat: number | null; lon: number | null } | null;
    if (flag?.lat != null && flag?.lon != null) { targetLat = flag.lat; targetLon = flag.lon; targetType = "flag"; }
    const { data: ch } = await admin.from("course_holes").select("green_center_lat, green_center_lon, par").eq("course_id", courseId).eq("hole_number", hole).maybeSingle();
    const c = ch as { green_center_lat: number | null; green_center_lon: number | null; par: number | null } | null;
    par = c?.par ?? null;
    if (targetLat == null && c?.green_center_lat != null && c?.green_center_lon != null) { targetLat = c.green_center_lat; targetLon = c.green_center_lon; targetType = "green"; }
  }

  let distance: number | null = null;
  if (teeLat != null && teeLon != null && targetLat != null && targetLon != null) {
    distance = Math.round(yards(teeLat, teeLon, targetLat, targetLon));
  }

  // Bolsa del jugador (yardas full por bastón).
  const { data: bagRow } = await admin.from("yardage_player_bags").select("payload").eq("scope_key", `player:${playerId}`).maybeSingle();
  const bagClubs = ((bagRow as { payload?: { clubs?: Array<{ catalogId?: string; enabled?: boolean; yardsFull?: number }> } } | null)?.payload?.clubs) ?? [];
  const bag = bagClubs
    .filter((c) => c?.enabled && c.catalogId && c.catalogId !== "putter" && (c.yardsFull ?? 0) > 0)
    .map((c) => ({ id: c.catalogId as string, yards: c.yardsFull as number }))
    .sort((a, b2) => b2.yards - a.yards);

  // Bastón MÁS USADO por posición de golpe en este hoyo (tu constante real).
  const byStroke = new Map<number, Map<string, number>>();
  for (const s of shots) {
    if (s.stroke_no == null || !s.club || s.club === "putter" || s.club === "penalty") continue;
    const m = byStroke.get(s.stroke_no) ?? new Map<string, number>();
    m.set(s.club, (m.get(s.club) ?? 0) + 1);
    byStroke.set(s.stroke_no, m);
  }
  const modeClub = (sn: number): string | null => {
    const m = byStroke.get(sn);
    if (!m) return null;
    return [...m.entries()].sort((a, b2) => b2[1] - a[1])[0][0];
  };
  const bagYards = new Map(bag.map((c) => [c.id, c.yards]));

  // Plan: para cada golpe usa tu bastón más constante en esa posición;
  // si no hay historial, cae a la distancia restante.
  const plan: Array<{ stroke: number; club: string; yards: number }> = [];
  if (distance != null && bag.length) {
    const shotsToGreen = par != null ? Math.max(1, par - 2) : 1;
    const minApproach = bag[bag.length - 1].yards;
    const closest = (target: number) => bag.reduce((best, c) => (Math.abs(c.yards - target) < Math.abs(best.yards - target) ? c : best), bag[0]);
    let remaining = distance;
    for (let i = 0; i < shotsToGreen; i++) {
      const sn = i + 1;
      const isLast = i === shotsToGreen - 1;
      let pick: { id: string; yards: number };
      const hist = modeClub(sn);
      if (hist && bagYards.has(hist)) {
        pick = { id: hist, yards: bagYards.get(hist) as number };
      } else if (isLast) {
        pick = closest(remaining);
      } else {
        const cap = Math.max(1, remaining - minApproach);
        pick = bag.filter((c) => c.yards <= cap)[0] ?? bag.filter((c) => c.yards < remaining)[0] ?? bag[bag.length - 1];
      }
      plan.push({ stroke: sn, club: pick.id, yards: pick.yards });
      remaining = Math.max(0, remaining - pick.yards);
    }
  }

  const planTotal = plan.reduce((a, p) => a + p.yards, 0);
  return NextResponse.json({ ok: true, hole, par, distance, targetType, plan, planTotal });
}
