import type { SupabaseClient } from "@supabase/supabase-js";
import type { GroupDot, MarshalDot } from "@/app/ritmo/demo/RitmoMap";
import type { LiveGroup } from "@/app/(backoffice)/ritmo/RitmoLiveView";
import { buildRitmoLiveGroupsForRound } from "@/lib/ritmo/buildRitmoLiveGroups";
import { loadRoundIdsWithCaptureActivityToday } from "@/lib/ritmo/loadCaptureLagGroups";
import { loadMarshalPositions } from "@/lib/marshal/loadMarshalPositions";
import { getHoleCenter, offsetHolePosition } from "@/lib/ritmo/holeCenters";
import {
  resolveLiveRoundsForTournament,
  todayMexicoDate,
} from "@/lib/ritmo/opsDay";
import { loadPerHoleMinutes } from "@/lib/telegram/ritmo/paceCalculator";
import { isGroupOnCourse } from "@/lib/ritmo/groupOnCourse";

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

/** Misma lógica de posición en mapa que RitmoLiveView (GPS real o hoyo capturado). */
function liveGroupsToMapDots(groups: LiveGroup[]): GroupDot[] {
  const byHole = new Map<number, LiveGroup[]>();
  for (const g of groups) {
    const h = g.hoyo;
    if (h != null && h >= 1 && h <= 18) {
      const arr = byHole.get(h) ?? [];
      arr.push(g);
      byHole.set(h, arr);
    }
  }

  const out: GroupDot[] = [];
  for (const g of groups) {
    if (g.lat != null && g.lon != null) {
      out.push({
        id: g.id,
        number: g.number,
        lat: g.lat,
        lon: g.lon,
        hoyo: g.hoyo ?? 0,
        status: g.status,
        label: g.label,
        detail: g.detail,
        positionSource: "gps",
      });
      continue;
    }
    const h = g.hoyo;
    if (h == null || h < 1 || h > 18) continue;
    const center = getHoleCenter(h);
    if (!center) continue;
    const peers = byHole.get(h) ?? [g];
    const idx = peers.findIndex((p) => p.id === g.id);
    const pos = offsetHolePosition(center, idx, peers.length);
    out.push({
      id: g.id,
      number: g.number,
      lat: pos.lat,
      lon: pos.lon,
      hoyo: h,
      status: g.status,
      label: g.label,
      detail: g.detail,
      positionSource: "capture",
    });
  }
  return out;
}

/** Mapa de ritmo para marshals — mismos datos que /ritmo backoffice. */
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
  const tournamentEndDate = (tournament.end_date as string | null) ?? null;
  const tournamentStartDate = (tournament.start_date as string | null) ?? null;

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
  const liveRounds = resolveLiveRoundsForTournament({
    rounds,
    queryRoundId: selectedRoundId,
    today,
    now,
    tournamentEndDate,
    tournamentStartDate,
    activityRoundIds,
  });
  if (liveRounds.length === 0) return null;

  const perHoleMinutes = await loadPerHoleMinutes(
    admin,
    (tournament.course_id as string | null) ?? null,
    tid
  );

  const multi = !selectedRoundId && liveRounds.length > 1;
  const allGroups: LiveGroup[] = [];

  for (const round of liveRounds) {
    const groups = await buildRitmoLiveGroupsForRound(admin, {
      tournamentId: tid,
      round,
      tournamentEndDate,
      tournamentStartDate,
      today,
      now,
      perHoleMinutes,
      labelWithRound: multi,
    });
    allGroups.push(...groups);
  }

  const onCourse = allGroups.filter((g) =>
    isGroupOnCourse({
      teeTime: g.teeTime,
      actualStartAt: g.actualStartAt,
      roundDate: g.roundDate ?? liveRounds[0]?.round_date ?? null,
      scoreHolesPlayed: g.scoreHolesPlayed,
      lastScoreTs: g.lastScoreTs,
      gpsState: g.gpsState,
      now,
    })
  );

  const mapGroups = liveGroupsToMapDots(onCourse);

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
  const roundNos = liveRounds
    .map((r) => r.round_no)
    .filter((n): n is number => n != null);

  return {
    tournamentName,
    roundLabel: multi
      ? `En cancha · R${roundNos.join("+R")}`
      : `Ronda ${liveRounds[0]?.round_no ?? "?"}`,
    mapGroups,
    mapMarshals,
    counts,
  };
}
