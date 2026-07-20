import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { resolvePlayerId } from "@/lib/mobile/resolvePlayer";

export const dynamic = "force-dynamic";

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

type Row = { shot_id: string; hole: number | null; club: string | null; actual_yards: number | null; planned_yards: number | null; completed_at: string | null };

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
    if (iso) { const d = new Date(iso); const s = new Date(d); s.setHours(0,0,0,0); const e = new Date(d); e.setHours(23,59,59,999); from = s.toISOString(); to = e.toISOString(); }
  }

  let q = admin.from("v_yardage_shots")
    .select("shot_id, hole, club, actual_yards, planned_yards, completed_at")
    .eq("player_id", playerId);
  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  const { data, error } = await q.limit(10000);
  if (error) { console.error("APPROACH-LIST:", error); return NextResponse.json({ ok: false, error: "Error consultando approach" }, { status: 500 }); }
  const rows = (data ?? []) as Row[];

  const { data: exRows } = await admin.from("yardage_excluded_shots").select("shot_id").eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  const shots: Array<{ shot_id: string; hole: number; club: string | null; planned: number; actual: number | null; vs_plan: number | null; date: string | null; excluded: boolean }> = [];
  for (const r of rows) {
    if (r.club === "putter" || r.club === "penalty") continue;
    const planned = n(r.planned_yards);
    const actual = n(r.actual_yards);
    if (planned == null || planned <= 0 || planned > 60) continue;
    if (planned < min || planned > max) continue;
    shots.push({
      shot_id: r.shot_id,
      hole: r.hole ?? 0,
      club: r.club,
      planned: Math.round(planned),
      actual: actual == null ? null : Math.round(actual),
      vs_plan: actual != null && planned > 0 ? Math.round((actual / planned) * 100) : null,
      date: r.completed_at,
      excluded: excluded.has(r.shot_id),
    });
  }
  shots.sort((a, b2) => (b2.date ?? "").localeCompare(a.date ?? ""));

  return NextResponse.json({ ok: true, shots });
}
