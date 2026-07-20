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
  { key: "0-10", min: 0, max: 10 },
  { key: "11-20", min: 11, max: 20 },
  { key: "21-30", min: 21, max: 30 },
  { key: "31-40", min: 31, max: 40 },
  { key: "41-50", min: 41, max: 50 },
  { key: "51-60", min: 51, max: 60 },
];
function bucketIndex(d: number): number {
  if (d <= 10) return 0;
  if (d <= 20) return 1;
  if (d <= 30) return 2;
  if (d <= 40) return 3;
  if (d <= 50) return 4;
  return 5;
}

type Row = { shot_id: string; hole: number | null; stroke_no: number | null; club: string | null; actual_yards: number | null; planned_yards: number | null; completed_at: string | null };

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
    if (iso) { const d = new Date(iso); const s = new Date(d); s.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); from = s.toISOString(); to = e.toISOString(); }
  }

  let q = admin.from("v_yardage_shots")
    .select("shot_id, hole, stroke_no, club, actual_yards, planned_yards, completed_at")
    .eq("player_id", playerId);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(10000);
  if (error) { console.error("APPROACH:", error); return NextResponse.json({ ok: false, error: "Error consultando approach" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

  const { data: exRows } = await admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  const count = new Array(6).fill(0);
  const sumActual = new Array(6).fill(0);
  const sumVsPlan = new Array(6).fill(0);

  for (const r of rows) {
    if (excluded.has(r.shot_id)) continue;
    if (r.club === "putter" || r.club === "penalty") continue;
    const planned = n(r.planned_yards);
    const actual = n(r.actual_yards);
    if (planned == null || planned <= 0 || planned > 60) continue;
    if (actual == null) continue;
    const bi = bucketIndex(planned);
    count[bi] += 1;
    sumActual[bi] += actual;
    sumVsPlan[bi] += (actual / planned) * 100;
  }

  const buckets = BUCKETS.map((bk, i) => ({
    key: bk.key,
    shots: count[i],
    avg_yards: count[i] ? Math.round(sumActual[i] / count[i]) : null,
    avg_vs_plan: count[i] ? Math.round(sumVsPlan[i] / count[i]) : null,
  }));

  return NextResponse.json({ ok: true, buckets });
}
