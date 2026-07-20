import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";

export const dynamic = "force-dynamic";

const n = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const WINDOW_YD = 5; // ±5 yardas
const MIN_SHOTS = 3; // mínimo de tiros por bastón para sugerir

type Row = {
  shot_id: string;
  club: string | null;
  actual_yards: number | null;
  planned_yards: number | null;
};

/** Resuelve el player_id a partir del entry_id (tournament_entries). */
async function playerFromEntry(
  admin: ReturnType<typeof createAdminClient>,
  entryId: string
): Promise<string | null> {
  const { data } = await admin
    .from("tournament_entries")
    .select("player_id")
    .eq("id", entryId)
    .maybeSingle();
  const pid = (data as { player_id?: string | null } | null)?.player_id;
  return pid ?? null;
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
  }
  const b = body as { entry_id?: unknown; distance?: unknown; club?: unknown };
  const entryId = String(b.entry_id ?? "").trim();
  const distance = n(b.distance);
  const chosenClub = b.club ? String(b.club) : null;

  if (!entryId) return NextResponse.json({ ok: false, error: "Falta entry_id" }, { status: 400 });
  if (distance == null || distance <= 0)
    return NextResponse.json({ ok: false, error: "Falta distance" }, { status: 400 });

  const admin = createAdminClient();
  const playerId = await playerFromEntry(admin, entryId);
  if (!playerId) return NextResponse.json({ ok: true, suggestion: null });

  // Historial completo del jugador (todos los hoyos).
  const { data, error } = await admin
    .from("v_yardage_shots")
    .select("shot_id, club, actual_yards, planned_yards")
    .eq("player_id", playerId)
    .limit(10000);
  if (error) {
    console.error("SUGGEST-CLUB:", error);
    return NextResponse.json({ ok: false, error: "Error consultando historial" }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];

  const { data: exRows } = await admin
    .from("yardage_excluded_shots")
    .select("shot_id")
    .eq("player_id", playerId);
  const excluded = new Set((exRows ?? []).map((r) => (r as { shot_id: string }).shot_id));

  // Agrupa por bastón los tiros cuyas yardas REALES caen dentro de ±5 de la distancia.
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (excluded.has(r.shot_id)) continue;
    if (!r.club || r.club === "putter" || r.club === "penalty") continue;
    const actual = n(r.actual_yards);
    if (actual == null) continue;
    if (Math.abs(actual - distance) > WINDOW_YD) continue;
    const arr = groups.get(r.club) ?? [];
    arr.push(actual);
    groups.set(r.club, arr);
  }

  // Calcula constancia (desviación estándar) por bastón con ≥ MIN_SHOTS tiros.
  type Stat = { club: string; shots: number; avg: number; sd: number };
  const stats: Stat[] = [];
  for (const [club, vals] of groups.entries()) {
    if (vals.length < MIN_SHOTS) continue;
    const avg = vals.reduce((a, c) => a + c, 0) / vals.length;
    const variance = vals.reduce((a, c) => a + (c - avg) * (c - avg), 0) / vals.length;
    const sd = Math.sqrt(variance);
    stats.push({ club, shots: vals.length, avg: Math.round(avg), sd });
  }

  if (stats.length === 0) return NextResponse.json({ ok: true, suggestion: null });

  // El más constante = menor desviación.
  stats.sort((a, b2) => a.sd - b2.sd);
  const best = stats[0];

  // Si el bastón elegido ya es el más constante, no molestamos.
  if (chosenClub && best.club === chosenClub) {
    return NextResponse.json({ ok: true, suggestion: null });
  }

  return NextResponse.json({
    ok: true,
    suggestion: {
      club: best.club,
      shots: best.shots,
      avg_yards: best.avg,
      consistency: Math.round(best.sd * 10) / 10, // yd de variación (menor = más parejo)
    },
  });
}
