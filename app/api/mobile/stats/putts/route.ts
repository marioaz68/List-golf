/**
 * POST /api/mobile/stats/putts
 *
 * Estadística de putts por rango de distancia (yardas):
 *  0-5, 6-10, 11-15, 16-20, 21-25, >25.
 * Para cada rango:
 *  - % metidos (putts holed desde esa distancia).
 *  - % de 3-putts (hoyos cuyo PRIMER putt fue de esa distancia y acabaron en 3+).
 *
 * Un putt es "metido" si es el último golpe del hoyo. Respeta exclusiones.
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

export const BUCKETS = [
  { key: "0-5", min: 0, max: 5 },
  { key: "6-10", min: 6, max: 10 },
  { key: "11-15", min: 11, max: 15 },
  { key: "16-20", min: 16, max: 20 },
  { key: "21-25", min: 21, max: 25 },
  { key: ">25", min: 26, max: Infinity },
];
function bucketIndex(d: number): number {
  if (d <= 5) return 0;
  if (d <= 10) return 1;
  if (d <= 15) return 2;
  if (d <= 20) return 3;
  if (d <= 25) return 4;
  return 5;
}

type Row = { shot_id: string; round_id: string | null; hole: number | null; stroke_no: number | null; club: string | null; actual_yards: number | null; completed_at: string | null };

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
  if (error) { console.error("PUTTS:", error); return NextResponse.json({ ok: false, error: "Error consultando putts" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

  const { data: exRows } = await admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  // Agrupa por ronda+hoyo.
  const holes = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.hole == null) continue;
    const k = `${r.round_id ?? "r"}:${r.hole}`;
    (holes.get(k) ?? holes.set(k, []).get(k)!).push(r);
  }

  const attempts = new Array(6).fill(0);
  const made = new Array(6).fill(0);
  const firstPuttHoles = new Array(6).fill(0);
  const threePutt = new Array(6).fill(0);

  for (const list of holes.values()) {
    const maxStroke = list.reduce((m, r) => Math.max(m, r.stroke_no ?? 0), 0);
    const putts = list
      .filter((r) => r.club === "putter" && !excluded.has(r.shot_id))
      .sort((a, b2) => (a.stroke_no ?? 0) - (b2.stroke_no ?? 0));
    // Cada putt cuenta para "% metidos".
    for (const p of putts) {
      const d = n(p.actual_yards);
      if (d == null) continue;
      const bi = bucketIndex(d);
      attempts[bi] += 1;
      if (p.stroke_no === maxStroke) made[bi] += 1;
    }
    // 3-putts por distancia del PRIMER putt.
    if (putts.length > 0) {
      const first = putts[0];
      const d = n(first.actual_yards);
      if (d != null) {
        const bi = bucketIndex(d);
        firstPuttHoles[bi] += 1;
        if (putts.length >= 3) threePutt[bi] += 1;
      }
    }
  }

  const buckets = BUCKETS.map((bk, i) => ({
    key: bk.key,
    attempts: attempts[i],
    made: made[i],
    made_pct: attempts[i] ? Math.round((made[i] / attempts[i]) * 100) : null,
    three_putt_holes: firstPuttHoles[i],
    three_putt_pct: firstPuttHoles[i] ? Math.round((threePutt[i] / firstPuttHoles[i]) * 100) : null,
  }));

  return NextResponse.json({ ok: true, buckets });
}
