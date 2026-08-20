import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupDot, MarshalDot } from "@/app/ritmo/demo/RitmoMap";
import type { CaptureLagKind } from "@/lib/ritmo/captureLag";
import {
  loadCaptureLagGroupsForRound,
  loadRoundIdsWithCaptureActivityToday,
} from "@/lib/ritmo/loadCaptureLagGroups";
import { loadMarshalPositions } from "@/lib/marshal/loadMarshalPositions";
import { getHoleCenter, offsetHolePosition } from "@/lib/ritmo/holeCenters";
import {
  resolveLiveRoundForTournament,
  resolveOpsRoundDate,
  todayMexicoDate,
} from "@/lib/ritmo/opsDay";
import {
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import { isGroupOnCourse } from "@/lib/ritmo/groupOnCourse";

function lagKindToMapStatus(
  kind: CaptureLagKind
): GroupDot["status"] {
  switch (kind) {
    case "critico":
    case "atrasado":
    case "silencioso":
      return "atrasado";
    case "ok":
    case "terminado":
      return "en_ritmo";
    case "cerrado":
      return "cerrado";
    default:
      return "sin_datos";
  }
}

export type MarshalRitmoSnapshot = {
  tournamentName: string;
  roundLabel: string;
  mapGroups: GroupDot[];
  mapMarshals: MarshalDot[];
  counts: {
    atrasado: number;
    en_ritmo: number;
    adelantado: number;
    sin_datos: number;
    cerrado: number;
  };
};

/** Mapa de ritmo para marshals (posición por GPS o hoyo capturado). */
export async function loadMarshalRitmoSnapshot(
  admin: SupabaseClient,
  tournamentId: string,
  selectedRoundId?: string | null
): Promise<MarshalRitmoSnapshot | null> {
  const tid = String(tournamentId ?? "").trim();
  if (!tid) return null;

  const today = todayMexicoDate();
  const now = new Date();

  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name, short_name, course_name, course_id, start_date, end_date")
    .eq("id", tid)
    .maybeSingle();
  if (!tournament) return null;

  const tournamentName =
    (tournament.short_name as string | null) ??
    (tournament.name as string | null) ??
    "Torneo";

  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date, start_time")
    .eq("tournament_id", tid)
    .order("round_no", { ascending: true });

  const rounds = (roundsRaw ?? []) as Array<{
    id: string;
    round_no: number | null;
    round_date: string | null;
    start_time: string | null;
  }>;
  const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(admin, today);
  const round = resolveLiveRoundForTournament({
    rounds,
    queryRoundId: selectedRoundId,
    today,
    now,
    tournamentEndDate: (tournament.end_date as string | null) ?? null,
    tournamentStartDate: (tournament.start_date as string | null) ?? null,
    activityRoundIds,
  });
  if (!round) return null;

  const perHoleMinutes: PerHoleMinutes = await loadPerHoleMinutes(
    admin,
    (tournament.course_id as string | null) ?? null,
    tid
  );
  const opsRoundDate =
    resolveOpsRoundDate({
      roundDate: round.round_date,
      today,
      liveCaptureToday: activityRoundIds.has(round.id),
    }) ?? today;

  const lagGroups = await loadCaptureLagGroupsForRound(admin, {
    tournamentId: tid,
    tournamentName,
    courseName: (tournament.course_name as string | null) ?? null,
    courseId: (tournament.course_id as string | null) ?? null,
    roundId: round.id,
    roundNo: round.round_no,
    roundDate: round.round_date,
    opsRoundDate,
    tournamentEndDate: (tournament.end_date as string | null) ?? null,
    tournamentStartDate: (tournament.start_date as string | null) ?? null,
    now,
    perHoleMinutes,
  });

  const onCourse = lagGroups.filter((g) =>
    isGroupOnCourse({
      teeTime: g.teeTime,
      actualStartAt: g.actualStartAt,
      roundDate: round.round_date,
      scoreHolesPlayed: g.holesPlayed,
      lastScoreTs: g.lastCaptureTs,
      gpsState: "none",
      now,
    })
  );

  const byHole = new Map<number, typeof onCourse>();
  for (const g of onCourse) {
    const h = g.captureHole ?? g.lastHole ?? g.expectedHole;
    if (h == null || h < 1 || h > 18) continue;
    const arr = byHole.get(h) ?? [];
    arr.push(g);
    byHole.set(h, arr);
  }

  const mapGroups: GroupDot[] = [];
  for (const g of onCourse) {
    const h = g.captureHole ?? g.lastHole ?? g.expectedHole;
    if (h == null || h < 1 || h > 18) continue;
    const center = getHoleCenter(h);
    if (!center) continue;
    const peers = byHole.get(h) ?? [g];
    const idx = peers.findIndex((p) => p.id === g.id);
    const pos = offsetHolePosition(center, idx, peers.length);
    mapGroups.push({
      id: g.id,
      number: g.number,
      lat: pos.lat,
      lon: pos.lon,
      hoyo: h,
      status: lagKindToMapStatus(g.kind),
      label: g.label,
      detail: g.reason,
      positionSource: "capture",
    });
  }

  const counts = {
    atrasado: 0,
    en_ritmo: 0,
    adelantado: 0,
    sin_datos: 0,
    cerrado: 0,
  };
  for (const dot of mapGroups) {
    counts[dot.status as keyof typeof counts] += 1;
  }

  const mapMarshals = await loadMarshalPositions(admin, tid);

  return {
    tournamentName,
    roundLabel: `Ronda ${round.round_no ?? "?"}`,
    mapGroups,
    mapMarshals,
    counts,
  };
}
