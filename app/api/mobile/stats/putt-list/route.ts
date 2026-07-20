/**
 * POST /api/mobile/stats/putt-list
 *
 * Lista los putts dentro de un rango de distancia (para el drill-down),
 * con si se metió, hoyo, fecha y si está excluido.
 *
 * Body: { initData, min, max, from?, to?, last? }  (max null = sin tope)
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

type Row = { shot_id: string; round_id: string | null; hole: number | null; stroke_no: number | null; club: string | null; actual_yards: number | null; completed_at: string | null };

export async function POST(req: Request) {
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 }); }
  const b = body as { initData?: unknown; min?: unknown; max?: unknown; from?: unknown; to?: unknown; last?: unknown };
  const initData = String(b.initData ?? "");
  const min = Number(b.min ?? 0);
  const max = b.max === null || b.max === undefined ? Infinity : Number(b.max);
  let from = b.from ? String(b.from) : null;
  let to = b.to ? String(b.to) : null;
  const lastRound = Boolean(b.last);

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
    .select("shot_id, round_id, hole, stroke_no, club, actual_yards, completed_at")
    .eq("player_id", playerId);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(10000);
  if (error) { console.error("PUTT-LIST:", error); return NextResponse.json({ ok: false, error: "Error consultando putts" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

  const { data: exRows } = await admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  // maxStroke por hoyo para saber si el putt se metió.
  const holes = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.hole == null) continue;
    const k = `${r.round_id ?? "r"}:${r.hole}`;
    (holes.get(k) ?? holes.set(k, []).get(k)!).push(r);
  }

  const putts: Array<{ shot_id: string; hole: number; distance: number; made: boolean; date: string | null; excluded: boolean }> = [];
  for (const list of holes.values()) {
    const maxStroke = list.reduce((m, r) => Math.max(m, r.stroke_no ?? 0), 0);
    for (const r of list) {
      if (r.club !== "putter") continue;
      const d = n(r.actual_yards);
      if (d == null || d < min || d > max) continue;
      putts.push({
        shot_id: r.shot_id,
        hole: r.hole ?? 0,
        distance: Math.round(d * 10) / 10,
        made: r.stroke_no === maxStroke,
        date: r.completed_at,
        excluded: excluded.has(r.shot_id),
      });
    }
  }
  putts.sort((a, b2) => (b2.date ?? "").localeCompare(a.date ?? ""));

  return NextResponse.json({ ok: true, putts });
}
