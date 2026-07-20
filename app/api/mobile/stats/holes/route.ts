/**
 * POST /api/mobile/stats/holes
 *
 * Resumen del módulo Hoyos:
 *  - Promedios por ronda: putts, greens in regulation (GIR) y drives en fairway.
 *  - Lista de hoyos 1-18 con par (del campo más reciente) y score promedio.
 *
 * Definiciones (aproximadas a partir de los tiros capturados):
 *  - Putts = tiros con putter.
 *  - GIR = llegar al green en (par-2) golpes o menos (tiros sin putter <= par-2).
 *  - Drive en fairway = en hoyos par>=4, el 2º tiro se juega desde 'fairway'.
 *
 * Body: { initData, from?, to?, last? }
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
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v: number | null, d = 0) => (v == null ? null : Number(v.toFixed(d)));

type Row = {
  shot_log_id: string;
  round_id: string | null;
  course_id: string | null;
  hole: number | null;
  stroke_no: number | null;
  club: string | null;
  lie_kind: string | null;
  is_penalty: boolean | null;
  completed_at: string | null;
};

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const b = body as { initData?: unknown; from?: unknown; to?: unknown; last?: unknown };
  const initData = String(b.initData ?? "");
  let from = b.from ? String(b.from) : null;
  let to = b.to ? String(b.to) : null;
  const lastRound = Boolean(b.last);

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
    .select("shot_log_id, round_id, course_id, hole, stroke_no, club, lie_kind, is_penalty, completed_at")
    .eq("player_id", playerId);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(8000);
  if (error) { console.error("HOLES:", error); return NextResponse.json({ ok: false, error: "Error consultando hoyos" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

  // Par por (course_id, hole).
  const courseIds = [...new Set(rows.map((r) => r.course_id).filter(Boolean) as string[])];
  const parMap = new Map<string, number>();
  if (courseIds.length) {
    const { data: parRows } = await admin
      .from("course_holes").select("course_id, hole_number, par").in("course_id", courseIds);
    for (const p of parRows ?? []) {
      const pr = p as { course_id: string; hole_number: number; par: number | null };
      if (pr.par != null) parMap.set(`${pr.course_id}:${pr.hole_number}`, pr.par);
    }
  }

  // Jugadas de hoyo excluidas manualmente por el jugador.
  const { data: exH } = await admin
    .from("yardage_excluded_holes").select("round_key, hole").eq("player_id", playerId);
  const excludedHoles = new Set(
    (exH ?? []).map((r) => `${(r as { round_key: string }).round_key}:${(r as { hole: number }).hole}`)
  );

  // Agrupa por ronda -> hoyo -> tiros.
  type HoleAgg = { course_id: string | null; shots: number; putts: number; nonPutt: number; penalties: number; stroke2Lie: string | null };
  const rounds = new Map<string, Map<number, HoleAgg>>();
  for (const r of rows) {
    if (r.hole == null) continue;
    const rk = r.round_id ?? r.shot_log_id;
    if (excludedHoles.has(`${rk}:${r.hole}`)) continue; // jugada excluida
    let holes = rounds.get(rk);
    if (!holes) { holes = new Map(); rounds.set(rk, holes); }
    let h = holes.get(r.hole);
    if (!h) { h = { course_id: r.course_id, shots: 0, putts: 0, nonPutt: 0, penalties: 0, stroke2Lie: null }; holes.set(r.hole, h); }
    h.shots += 1;
    if (r.club === "putter") h.putts += 1; else h.nonPutt += 1;
    if (r.is_penalty) h.penalties += 1;
    if (r.stroke_no === 2) h.stroke2Lie = r.lie_kind;
  }

  const puttsPerRound: number[] = [], girPerRound: number[] = [], fairPerRound: number[] = [], penaltiesPerRound: number[] = [];
  // Acumula score por hoyo (todas las rondas) para la lista 1-18.
  const holeScores = new Map<number, number[]>();
  let refCourse: string | null = null;
  let refDate = 0;

  for (const holes of rounds.values()) {
    let putts = 0, gir = 0, fair = 0, penalties = 0;
    for (const [hole, h] of holes) {
      putts += h.putts;
      penalties += h.penalties;
      const par = h.course_id ? parMap.get(`${h.course_id}:${hole}`) ?? null : null;
      if (par != null && h.nonPutt > 0 && h.nonPutt <= par - 2) gir += 1;
      if (par != null && par >= 4 && h.stroke2Lie === "fairway") fair += 1;
      (holeScores.get(hole) ?? holeScores.set(hole, []).get(hole)!).push(h.shots);
    }
    puttsPerRound.push(putts);
    girPerRound.push(gir);
    fairPerRound.push(fair);
    penaltiesPerRound.push(penalties);
  }

  // Campo de referencia = el de la ronda más reciente (para el par de la lista).
  for (const r of rows) {
    if (!r.course_id || !r.completed_at) continue;
    const t = new Date(r.completed_at).getTime();
    if (t > refDate) { refDate = t; refCourse = r.course_id; }
  }

  const holesList = Array.from({ length: 18 }, (_, i) => {
    const hole = i + 1;
    const scores = holeScores.get(hole) ?? [];
    return {
      hole,
      par: refCourse ? parMap.get(`${refCourse}:${hole}`) ?? null : null,
      avg_score: round(avg(scores), 1),
      rounds: scores.length,
    };
  });

  return NextResponse.json({
    ok: true,
    rounds: rounds.size,
    avg_putts: round(avg(puttsPerRound), 1),
    avg_gir: round(avg(girPerRound), 1),
    avg_fairways: round(avg(fairPerRound), 1),
    avg_penalties: round(avg(penaltiesPerRound), 1),
    holes: holesList,
  });
}
