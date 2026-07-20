/**
 * POST /api/mobile/stats/hole
 *
 * Detalle de un hoyo: cada JUGADA (ronda) de ese hoyo con golpes, fairway,
 * regulation (GIR), putts, penalizaciones y si está excluida del promedio.
 *
 * Body: { initData, hole, from?, to?, last? }
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePlayerId } from "@/lib/mobile/resolvePlayer";

export const dynamic = "force-dynamic";

type Row = {
  shot_log_id: string;
  round_id: string | null;
  course_id: string | null;
  stroke_no: number | null;
  club: string | null;
  lie_kind: string | null;
  is_penalty: boolean | null;
  completed_at: string | null;
};

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
    if (iso) {
      const d = new Date(iso);
      const s = new Date(d); s.setHours(0, 0, 0, 0);
      const e = new Date(d); e.setHours(23, 59, 59, 999);
      from = s.toISOString(); to = e.toISOString();
    }
  }

  let q = admin
    .from("v_yardage_shots")
    .select("shot_log_id, round_id, course_id, stroke_no, club, lie_kind, is_penalty, completed_at")
    .eq("player_id", playerId)
    .eq("hole", hole);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(4000);
  if (error) { console.error("HOLE:", error); return NextResponse.json({ ok: false, error: "Error consultando hoyo" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

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

  const { data: exH } = await admin
    .from("yardage_excluded_holes").select("round_key").eq("player_id", playerId).eq("hole", hole);
  const excluded = new Set((exH ?? []).map((r) => (r as { round_key: string }).round_key));

  type Play = { round_key: string; course_id: string | null; date: string | null; shots: number; putts: number; nonPutt: number; penalties: number; stroke2Lie: string | null; clubByStroke: Record<number, string> };
  const plays = new Map<string, Play>();
  for (const r of rows) {
    const rk = r.round_id ?? r.shot_log_id;
    let pl = plays.get(rk);
    if (!pl) { pl = { round_key: rk, course_id: r.course_id, date: r.completed_at, shots: 0, putts: 0, nonPutt: 0, penalties: 0, stroke2Lie: null, clubByStroke: {} }; plays.set(rk, pl); }
    pl.shots += 1;
    if (r.club === "putter") pl.putts += 1; else pl.nonPutt += 1;
    if (r.is_penalty) pl.penalties += 1;
    if (r.stroke_no === 2) pl.stroke2Lie = r.lie_kind;
    if (r.stroke_no != null && r.club && r.club !== "putter" && r.club !== "penalty") pl.clubByStroke[r.stroke_no] = r.club;
    if (r.completed_at && (!pl.date || r.completed_at > pl.date)) pl.date = r.completed_at;
  }

  const out = [...plays.values()].map((pl) => {
    const par = pl.course_id ? parByCourse.get(pl.course_id) ?? null : null;
    return {
      round_key: pl.round_key,
      date: pl.date,
      par,
      strokes: pl.shots,
      putts: pl.putts,
      penalties: pl.penalties,
      fairway: par != null && par >= 4 ? pl.stroke2Lie === "fairway" : null,
      gir: par != null ? pl.nonPutt > 0 && pl.nonPutt <= par - 2 : null,
      excluded: excluded.has(pl.round_key),
    };
  }).sort((a, b2) => (b2.date ?? "").localeCompare(a.date ?? ""));

  // --- Sugerencia de bastones (los que mejor te han funcionado en este hoyo) ---
  // par 3 -> 1 bastón, par 4 -> 2, par 5 -> 3 (par-2). Se toma de las MEJORES
  // jugadas (menos golpes) el bastón más usado en cada posición de tiro.
  const mode = (arr: string[]): string | null => {
    if (!arr.length) return null;
    const c = new Map<string, number>();
    for (const x of arr) c.set(x, (c.get(x) ?? 0) + 1);
    return [...c.entries()].sort((a, b2) => b2[1] - a[1])[0][0];
  };
  const pars = [...plays.values()].map((p) => (p.course_id ? parByCourse.get(p.course_id) ?? null : null)).filter((v): v is number => v != null);
  const repPar = pars.length ? mode(pars.map(String)) : null;
  const parNum = repPar != null ? Number(repPar) : null;
  const count = parNum != null ? Math.max(1, parNum - 2) : 1;

  const notExcluded = [...plays.values()].filter((p) => !excluded.has(p.round_key));
  // Prioriza las jugadas con menos golpes (mejores); si hay par, usa <= par.
  const good = parNum != null ? notExcluded.filter((p) => p.shots <= parNum) : [];
  const pool = good.length ? good : notExcluded;

  const suggested: { stroke: number; club: string }[] = [];
  for (let s = 1; s <= count; s++) {
    const clubs = pool.map((p) => p.clubByStroke[s]).filter((c): c is string => Boolean(c));
    const club = mode(clubs);
    if (club) suggested.push({ stroke: s, club });
  }

  return NextResponse.json({ ok: true, hole, par: parNum, plays: out, suggested });
}
