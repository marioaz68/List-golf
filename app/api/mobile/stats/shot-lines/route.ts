/**
 * POST /api/mobile/stats/shot-lines
 *
 * Tiros (con coordenadas) de un hoyo + número de golpe, con un "estilo" de
 * calidad para dibujarlos sobre el mapa:
 *   - "solid":  alcanzó >=95% del objetivo Y terminó en el lie correcto
 *               (fairway si es tiro de avance, green si es el tiro al green).
 *   - "dashed": alcanzó >=85% (pero no cumple lo de arriba).
 *   - "dotted": por debajo del 85% (o sin objetivo).
 *
 * El lie donde TERMINÓ el tiro se infiere del lie del SIGUIENTE golpe del hoyo.
 *
 * Body: { initData, hole, stroke, from?, to?, last? }
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

type Row = {
  shot_id: string;
  round_id: string | null;
  course_id: string | null;
  stroke_no: number | null;
  club: string | null;
  lie_kind: string | null;
  from_lat: number | null; from_lon: number | null;
  to_lat: number | null; to_lon: number | null;
  actual_yards: number | null;
  planned_yards: number | null;
  completed_at: string | null;
};

function styleFor(pct: number | null, endedLie: string | null, strokeNo: number, par: number | null): "solid" | "dashed" | "dotted" {
  const greenStroke = par != null ? par - 2 : null;
  const isAdvancing = greenStroke != null ? strokeNo < greenStroke : true;
  let solid = false;
  if (pct != null && pct >= 95) {
    if (endedLie === "green") solid = true;              // llegó al green
    else if (isAdvancing && endedLie === "fairway") solid = true; // tiro de avance a calle
  }
  if (solid) return "solid";
  if (pct != null && pct >= 85) return "dashed";
  return "dotted";
}

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const b = body as { initData?: unknown; hole?: unknown; stroke?: unknown; from?: unknown; to?: unknown; last?: unknown };
  const initData = String(b.initData ?? "");
  const hole = Number(b.hole);
  const stroke = Number(b.stroke);
  let from = b.from ? String(b.from) : null;
  let to = b.to ? String(b.to) : null;
  const lastRound = Boolean(b.last);
  if (!Number.isFinite(hole) || !Number.isFinite(stroke)) {
    return NextResponse.json({ ok: false, error: "Falta hoyo o golpe" }, { status: 400 });
  }

  const admin = createAdminClient();
  const who = await resolvePlayerId(admin, initData);
  if (!who.ok) return NextResponse.json({ ok: false, error: who.error }, { status: who.status });
  const playerId = who.playerId;

  if (lastRound) {
    const { data: lastRow } = await admin
      .from("v_yardage_shots").select("completed_at").eq("player_id", playerId)
      .order("completed_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    const iso = (lastRow as { completed_at?: string | null } | null)?.completed_at;
    if (iso) {
      const d = new Date(iso);
      const s = new Date(d); s.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      from = s.toISOString(); to = e.toISOString();
    }
  }

  // Todos los golpes del hoyo (para inferir el lie donde terminó cada tiro).
  let q = admin
    .from("v_yardage_shots")
    .select("shot_id, round_id, course_id, stroke_no, club, lie_kind, from_lat, from_lon, to_lat, to_lon, actual_yards, planned_yards, completed_at")
    .eq("player_id", playerId)
    .eq("hole", hole);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(5000);
  if (error) { console.error("SHOT-LINES:", error); return NextResponse.json({ ok: false, error: "Error consultando tiros" }, { status: 500 }); }
  const rows = ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    shot_id: String(r.shot_id ?? ""),
    round_id: (r.round_id as string | null) ?? null,
    course_id: (r.course_id as string | null) ?? null,
    stroke_no: n(r.stroke_no),
    club: (r.club as string | null) ?? null,
    lie_kind: (r.lie_kind as string | null) ?? null,
    from_lat: n(r.from_lat), from_lon: n(r.from_lon),
    to_lat: n(r.to_lat), to_lon: n(r.to_lon),
    actual_yards: n(r.actual_yards),
    planned_yards: n(r.planned_yards),
    completed_at: (r.completed_at as string | null) ?? null,
  })) as Row[];

  // par del hoyo por curso
  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean) as string[])];
  const parByCourse = new Map<string, number>();
  if (courseIds.length) {
    const { data: parRows } = await admin
      .from("course_holes").select("course_id, par").eq("hole_number", hole).in("course_id", courseIds);
    for (const p of parRows ?? []) {
      const pr = p as { course_id: string; par: number | null };
      if (pr.par != null) parByCourse.set(pr.course_id, pr.par);
    }
  }

  const { data: exRows } = await admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  // Agrupa por ronda, ordena por golpe, y arma la salida del golpe pedido.
  const byRound = new Map<string, Row[]>();
  for (const r of rows) {
    const rk = r.round_id ?? "r";
    (byRound.get(rk) ?? byRound.set(rk, []).get(rk)!).push(r);
  }

  const shots: Array<{ shot_id: string; from_lat: number; from_lon: number; to_lat: number; to_lon: number; club: string | null; actual_yards: number | null; style: string; excluded: boolean }> = [];
  for (const list of byRound.values()) {
    list.sort((a, b2) => (a.stroke_no ?? 0) - (b2.stroke_no ?? 0));
    for (let i = 0; i < list.length; i++) {
      const r = list[i];
      if (r.stroke_no !== stroke) continue;
      if (r.from_lat == null || r.from_lon == null || r.to_lat == null || r.to_lon == null) continue;
      const endedLie = list[i + 1]?.lie_kind ?? null;
      const par = r.course_id ? parByCourse.get(r.course_id) ?? null : null;
      const pct = r.planned_yards && r.planned_yards > 0 && r.actual_yards != null ? (r.actual_yards / r.planned_yards) * 100 : null;
      shots.push({
        shot_id: r.shot_id,
        from_lat: r.from_lat, from_lon: r.from_lon, to_lat: r.to_lat, to_lon: r.to_lon,
        club: r.club, actual_yards: r.actual_yards,
        style: styleFor(pct, endedLie, stroke, par),
        excluded: excluded.has(r.shot_id),
      });
    }
  }

  // --- Bastón MÁS CONSTANTE para este golpe en el hoyo ---
  // "Bueno" = tiro de avance que quedó en fairway Y la jugada llegó al green
  // (green en regulación) → dejó buena distancia para el siguiente tiro; o,
  // si es el tiro al green, que haya quedado en green. Se sugiere el bastón
  // con mayor tasa de buenos resultados (más consistente).
  const tally = new Map<string, { att: number; good: number }>();
  for (const list of byRound.values()) {
    const course = list[0]?.course_id ?? null;
    const par = course ? parByCourse.get(course) ?? null : null;
    const greenStroke = par != null ? par - 2 : null;
    const nonPutt = list.filter((r) => r.club && r.club !== "putter" && r.club !== "penalty").length;
    const reachedGIR = par != null ? nonPutt <= par - 2 : false;
    const idx = list.findIndex((r) => r.stroke_no === stroke);
    if (idx < 0) continue;
    const r = list[idx];
    if (!r.club || r.club === "putter" || r.club === "penalty") continue;
    const endedLie = list[idx + 1]?.lie_kind ?? null;
    let good = false;
    if (greenStroke != null && stroke === greenStroke) good = endedLie === "green";
    else if (greenStroke == null || stroke < greenStroke) good = endedLie === "fairway" && reachedGIR;
    const t = tally.get(r.club) ?? { att: 0, good: 0 };
    t.att += 1; if (good) t.good += 1; tally.set(r.club, t);
  }
  let suggestedClub: string | null = null;
  let best = { rate: -1, att: 0 };
  for (const [club, t] of tally) {
    const rate = t.att ? t.good / t.att : 0;
    if (t.good > 0 && (rate > best.rate || (rate === best.rate && t.att > best.att))) {
      best = { rate, att: t.att }; suggestedClub = club;
    }
  }
  if (!suggestedClub) { let ma = 0; for (const [club, t] of tally) if (t.att > ma) { ma = t.att; suggestedClub = club; } }

  return NextResponse.json({ ok: true, hole, stroke, shots, suggestedClub });
}
