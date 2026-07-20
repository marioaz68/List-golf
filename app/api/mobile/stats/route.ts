/**
 * POST /api/mobile/stats
 *
 * Devuelve la estadística PERSONAL de un jugador (distancias por palo, métricas
 * de swing e historial) para la Mini App de Telegram, con filtro por RANGO DE
 * FECHAS.
 *
 * Modelo de acceso ("solo el dueño"):
 *  - yardage_shot_logs es PRIVADA (solo service_role).
 *  - El jugador se DERIVA del initData de Telegram (firmado), no del body.
 *
 * Body: { initData: string, from?: string, to?: string, recent?: boolean }
 *   - from / to: ISO (p. ej. "2026-01-01"). Si se omiten, es todo el histórico.
 *   - Las agregaciones se calculan sobre los tiros dentro del rango.
 */

import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import { validateTelegramInitData } from "@/lib/telegram/validateInitData";

export const dynamic = "force-dynamic";

type Row = {
  shot_log_id: string;
  shot_id: string | null;
  hole: number | null;
  stroke_no: number | null;
  club: string | null;
  swing: string | null;
  actual_yards: number | string | null;
  planned_yards: number | string | null;
  tempo_ratio: number | string | null;
  peak_downswing_deg_s: number | string | null;
  peak_backswing_deg_s: number | string | null;
  swing_plane_deg: number | string | null;
  backswing_ms: number | string | null;
  downswing_ms: number | string | null;
  completed_at: string | null;
};

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (v: number | null, d = 0) => (v == null ? null : Number(v.toFixed(d)));

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }

  const b = body as { initData?: unknown; from?: unknown; to?: unknown; recent?: unknown; last?: unknown };
  const initData = String(b.initData ?? "");
  let from = b.from ? String(b.from) : null;
  let to = b.to ? String(b.to) : null;
  const includeRecent = Boolean(b.recent);
  const lastRound = Boolean(b.last); // "última jugada": el día más reciente con tiros

  // 1) Validar Telegram y obtener usuario.
  const check = validateTelegramInitData(initData);
  if (!check.ok || !check.user) {
    return NextResponse.json({ ok: false, error: check.error ?? "No autorizado" }, { status: 401 });
  }
  const telegramUserId = String(check.user.id);

  const admin = createAdminClient();

  // 2) telegram_user_id -> player_id.
  const { data: player, error: playerErr } = await admin
    .from("players")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();

  if (playerErr) {
    console.error("MOBILE STATS player lookup:", playerErr);
    return NextResponse.json({ ok: false, error: "Error identificando jugador" }, { status: 500 });
  }
  if (!player?.id) {
    return NextResponse.json(
      { ok: false, error: "Tu cuenta de Telegram no está vinculada a un jugador." },
      { status: 404 }
    );
  }
  const playerId = player.id as string;

  // 2.5) "Última jugada": ubica el día más reciente con tiros y acota a ese día.
  if (lastRound) {
    const { data: lastRow } = await admin
      .from("v_yardage_shots")
      .select("completed_at")
      .eq("player_id", playerId)
      .order("completed_at", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    const iso = (lastRow as { completed_at?: string | null } | null)?.completed_at;
    if (iso) {
      const d = new Date(iso);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      from = start.toISOString();
      to = end.toISOString();
    }
  }

  // 3) Traer TIROS del jugador dentro del rango y agregar en el servidor.
  let q = admin
    .from("v_yardage_shots")
    .select(
      "shot_log_id, shot_id, hole, stroke_no, club, swing, actual_yards, planned_yards, tempo_ratio, peak_downswing_deg_s, peak_backswing_deg_s, swing_plane_deg, backswing_ms, downswing_ms, completed_at"
    )
    .eq("player_id", playerId);

  if (from) q = q.gte("completed_at", from);
  if (to) q = q.lte("completed_at", to);
  q = q.order("completed_at", { ascending: false, nullsFirst: false }).limit(5000);

  const { data, error } = await q;
  if (error) {
    console.error("MOBILE STATS shots:", error);
    return NextResponse.json({ ok: false, error: "Error consultando estadísticas" }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];

  // Tiros excluidos manualmente por el jugador (no cuentan en promedios).
  const { data: exRows } = await admin
    .from("yardage_excluded_shots")
    .select("shot_id")
    .eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  // --- Bastones (excluye putter): agrupa por bastón + tipo de swing (full / 3·4) ---
  // Cada bastón se mide en Full y en 3/4 como si fueran independientes.
  const normSwing = (s: string | null): "full" | "three_quarter" =>
    s === "three_quarter" ? "three_quarter" : "full";
  const byKey = new Map<string, { ys: number[]; ratios: number[]; planned: number[] }>();
  for (const r of rows) {
    if (!r.club || r.club === "putter") continue;
    if (r.shot_id && excluded.has(r.shot_id)) continue; // excluido por el jugador
    const key = `${r.club}::${normSwing(r.swing)}`;
    let acc = byKey.get(key);
    if (!acc) { acc = { ys: [], ratios: [], planned: [] }; byKey.set(key, acc); }
    const y = n(r.actual_yards);
    const planned = n(r.planned_yards);
    if (y != null) acc.ys.push(y);
    if (planned != null && planned > 0) acc.planned.push(planned);
    if (y != null && planned != null && planned > 0) acc.ratios.push((y / planned) * 100);
  }

  // Bolsa COMPLETA: cada bastón activo (menos putter) genera 2 renglones (Full y 3/4).
  const { data: bagRow } = await admin
    .from("yardage_player_bags")
    .select("payload")
    .eq("scope_key", `player:${playerId}`)
    .maybeSingle();
  const bagClubs =
    (bagRow as { payload?: { clubs?: Array<{ catalogId?: string; enabled?: boolean; yardsFull?: number; yardsThreeQuarter?: number }> } } | null)
      ?.payload?.clubs ?? [];

  type Entry = { catalogId: string; swing: "full" | "three_quarter"; configured: number | null };
  const entries: Entry[] = [];
  for (const c of bagClubs) {
    if (!c?.enabled || !c.catalogId || c.catalogId === "putter") continue;
    entries.push({ catalogId: c.catalogId, swing: "full", configured: c.yardsFull ?? null });
    entries.push({ catalogId: c.catalogId, swing: "three_quarter", configured: c.yardsThreeQuarter ?? null });
  }
  // Añade grupos con tiros que no estén en la bolsa activa.
  for (const key of byKey.keys()) {
    const [club, sw] = key.split("::");
    if (!entries.some((e) => e.catalogId === club && e.swing === sw)) {
      entries.push({ catalogId: club, swing: sw as "full" | "three_quarter", configured: null });
    }
  }

  const clubDistances = entries.map((e) => {
    const acc = byKey.get(`${e.catalogId}::${e.swing}`) ?? { ys: [], ratios: [], planned: [] };
    const plannedAvg = round(avg(acc.planned)); // promedio de lo seleccionado antes de pegar
    return {
      player_id: playerId,
      club: e.catalogId,
      swing: e.swing,
      shots: acc.ys.length,
      avg_yards: round(avg(acc.ys)),           // real medido por GPS
      avg_planned: plannedAvg ?? e.configured, // seleccionado; si no hay tiros, la configurada
      avg_vs_plan: round(avg(acc.ratios)),     // real ÷ planeado (%)
      vs_plan_shots: acc.ratios.length,
    };
  });

  // --- Swing: 4 métricas del reloj (watch_swing_events), promediadas ---
  // back = subida (backswing), follow = bajada/follow-through.
  let swq = admin
    .from("watch_swing_events")
    .select("backswing_velocity_dps, backswing_club_deg, forwardswing_velocity_dps, forward_club_deg")
    .eq("player_id", playerId);
  if (from) swq = swq.gte("detected_at", from);
  if (to) swq = swq.lte("detected_at", to);
  const { data: swingRows } = await swq.limit(5000);
  const sr = (swingRows ?? []) as Array<Record<string, number | null>>;
  const backV: number[] = [], backD: number[] = [], fwdV: number[] = [], fwdD: number[] = [];
  for (const s of sr) {
    const bv = n(s.backswing_velocity_dps); if (bv != null) backV.push(bv);
    const bd = n(s.backswing_club_deg); if (bd != null) backD.push(bd);
    const fv = n(s.forwardswing_velocity_dps); if (fv != null) fwdV.push(fv);
    const fd = n(s.forward_club_deg); if (fd != null) fwdD.push(fd);
  }
  const swingStats = sr.length
    ? {
        player_id: playerId,
        swings_measured: sr.length,
        avg_backswing_velocity_dps: round(avg(backV)),   // velocidad de back (°/s)
        avg_backswing_club_deg: round(avg(backD)),        // grados de elevación del back
        avg_forwardswing_velocity_dps: round(avg(fwdV)),  // velocidad de follow-through (°/s)
        avg_forward_club_deg: round(avg(fwdD)),           // grados de elevación del follow-through
      }
    : null;

  // --- Historial (mismos tiros ya ordenados por fecha) ---
  const recentShots = includeRecent
    ? rows.slice(0, 100).map((r) => ({
        shot_log_id: r.shot_log_id,
        hole: n(r.hole) ?? 0,
        stroke_no: n(r.stroke_no) ?? 0,
        club: r.club,
        actual_yards: n(r.actual_yards),
        tempo_ratio: n(r.tempo_ratio),
        peak_downswing_deg_s: n(r.peak_downswing_deg_s),
        completed_at: r.completed_at,
      }))
    : [];

  return NextResponse.json({
    ok: true,
    playerId,
    range: { from, to },
    totalShots: rows.length,
    clubDistances,
    swingStats,
    recentShots,
  });
}
