/**
 * POST /api/marshal/position
 *
 * Pings GPS desde la Mini App marshal (/captura/marshal).
 * Auth: telegram_chat_id en body (?tg= del URL).
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  marshalAccessibleTournamentIds,
  resolveMarshal,
} from "@/lib/marshal/resolveMarshal";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { getCourseHoles } from "@/lib/telegram/ritmo/holes";
import { loadRoundIdsWithCaptureActivityToday } from "@/lib/ritmo/loadCaptureLagGroups";
import {
  resolveLiveRoundForTournament,
  todayMexicoDate,
} from "@/lib/ritmo/opsDay";

export const dynamic = "force-dynamic";

const MAX_ACCURACY_M = 30;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido." }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const tg = String(o.tg ?? "").trim();
  const tournamentId = String(o.tournament_id ?? "").trim();
  const lat = Number(o.lat);
  const lon = Number(o.lon);
  const accuracy =
    o.accuracy != null && Number.isFinite(Number(o.accuracy))
      ? Number(o.accuracy)
      : null;

  if (!tg) {
    return NextResponse.json({ ok: false, error: "Falta tg." }, { status: 400 });
  }
  if (!tournamentId) {
    return NextResponse.json(
      { ok: false, error: "Falta tournament_id." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return NextResponse.json(
      { ok: false, error: "lat/lon inválidos." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const marshal = await resolveMarshal(admin, tg);
  if (!marshal) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const accessible = await marshalAccessibleTournamentIds(admin, marshal);
  if (!accessible.has(tournamentId)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, course_name, start_date, end_date")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) {
    return NextResponse.json(
      { ok: false, error: "Torneo no encontrado." },
      { status: 404 }
    );
  }

  const today = todayMexicoDate();
  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date, start_time")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });

  const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(admin, today);
  const round = resolveLiveRoundForTournament({
    rounds: (roundsRaw ?? []) as Array<{
      id: string;
      round_no: number | null;
      round_date: string | null;
      start_time: string | null;
    }>,
    today,
    tournamentEndDate: (tournament.end_date as string | null) ?? null,
    tournamentStartDate: (tournament.start_date as string | null) ?? null,
    activityRoundIds,
  });

  const courseName =
    (tournament.course_name as string | null) ?? "Club Campestre de Querétaro";
  const noisy = accuracy != null && accuracy > MAX_ACCURACY_M;
  const holes = getCourseHoles(courseName);
  const hoyo = !noisy && holes ? detectHole({ lat, lon }, holes) : null;

  const { error } = await admin.from("ritmo_positions").insert({
    tournament_id: tournamentId,
    round_id: round?.id ?? null,
    profile_id: marshal.profileId,
    lat,
    lon,
    hoyo_detectado: hoyo,
    is_live_update: true,
  });

  if (error) {
    console.error("MARSHAL POSITION insert:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, hoyo });
}
