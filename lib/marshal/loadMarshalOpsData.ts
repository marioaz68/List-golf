import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCaptureLagGroupsForRound,
  loadRoundIdsWithCaptureActivityToday,
  loadTodayRoundsAcrossTournaments,
  type CaptureLagGroupRow,
} from "@/lib/ritmo/loadCaptureLagGroups";
import {
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import {
  todayMexicoDate,
  resolveLiveRoundForTournament,
  resolveOpsRoundDate,
} from "@/lib/ritmo/opsDay";
import type { MarshalProfile } from "@/lib/marshal/resolveMarshal";
import { resolveMarshalDayTournamentId } from "@/lib/marshal/resolveMarshalDayTournament";
import { buildLiveResultsUrl } from "@/lib/marshal/liveResultsUrl";
import type { TournamentSettings } from "@/types/tournament";

export type MarshalTournamentOption = {
  id: string;
  name: string;
  liveResultsPath: string;
};

export type MarshalOpsPayload = {
  marshalName: string;
  today: string;
  computedAtISO: string;
  tournaments: MarshalTournamentOption[];
  selectedTournamentId: string | null;
  groups: CaptureLagGroupRow[];
};

export async function loadMarshalOpsData(
  admin: SupabaseClient,
  marshal: MarshalProfile,
  selectedTournamentId?: string | null
): Promise<MarshalOpsPayload> {
  const today = todayMexicoDate();
  const now = new Date();
  const computedAtISO = now.toISOString();

  const activeTournamentId = await resolveMarshalDayTournamentId(
    admin,
    marshal,
    selectedTournamentId
  );

  const tournaments: MarshalTournamentOption[] = [];
  const groups: CaptureLagGroupRow[] = [];

  if (!activeTournamentId) {
    return {
      marshalName: marshal.name,
      today,
      computedAtISO,
      tournaments,
      selectedTournamentId: null,
      groups,
    };
  }

  const { data: tRow } = await admin
    .from("tournaments")
    .select("id, name, short_name, course_name, course_id, start_date, end_date, settings")
    .eq("id", activeTournamentId)
    .maybeSingle();

  if (!tRow) {
    return {
      marshalName: marshal.name,
      today,
      computedAtISO,
      tournaments,
      selectedTournamentId: activeTournamentId,
      groups,
    };
  }

  const tournamentName =
    (tRow.short_name as string | null) ??
    (tRow.name as string | null) ??
    "Torneo";

  tournaments.push({
    id: activeTournamentId,
    name: tournamentName,
    liveResultsPath: buildLiveResultsUrl({
      tournamentId: activeTournamentId,
      settings: (tRow.settings ?? null) as TournamentSettings | null,
    }),
  });

  const allSlots = await loadTodayRoundsAcrossTournaments(admin, today);
  const slot = allSlots.find((s) => s.tournament.id === activeTournamentId);
  const perHoleMinutes: PerHoleMinutes = await loadPerHoleMinutes(
    admin,
    (tRow.course_id as string | null) ?? null
  );

  if (slot) {
    const rows = await loadCaptureLagGroupsForRound(admin, {
      tournamentId: activeTournamentId,
      tournamentName: slot.tournament.name,
      courseName: slot.tournament.courseName,
      courseId: slot.tournament.courseId,
      roundId: slot.roundId,
      roundNo: slot.roundNo,
      roundDate: slot.roundDate,
      opsRoundDate: slot.opsRoundDate,
      tournamentEndDate: slot.tournament.endDate,
      tournamentStartDate: slot.tournament.startDate,
      now,
      perHoleMinutes,
    });
    groups.push(...rows);
  } else {
    const { data: roundsRaw } = await admin
      .from("rounds")
      .select("id, round_no, round_date")
      .eq("tournament_id", activeTournamentId)
      .order("round_no", { ascending: true });
    const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(
      admin,
      today
    );
    const round = resolveLiveRoundForTournament({
      rounds: (roundsRaw ?? []) as Array<{
        id: string;
        round_no: number | null;
        round_date: string | null;
      }>,
      today,
      tournamentEndDate: (tRow.end_date as string | null) ?? null,
      tournamentStartDate: (tRow.start_date as string | null) ?? null,
      activityRoundIds,
    });
    if (round) {
      const opsRoundDate =
        resolveOpsRoundDate({
          roundDate: round.round_date,
          today,
          liveCaptureToday: activityRoundIds.has(round.id),
        }) ?? today;
      const rows = await loadCaptureLagGroupsForRound(admin, {
        tournamentId: activeTournamentId,
        tournamentName,
        courseName: (tRow.course_name as string | null) ?? null,
        courseId: (tRow.course_id as string | null) ?? null,
        roundId: round.id,
        roundNo: round.round_no,
        roundDate: round.round_date,
        opsRoundDate,
        tournamentEndDate: (tRow.end_date as string | null) ?? null,
        tournamentStartDate: (tRow.start_date as string | null) ?? null,
        now,
        perHoleMinutes,
      });
      groups.push(...rows);
    }
  }

  return {
    marshalName: marshal.name,
    today,
    computedAtISO,
    tournaments,
    selectedTournamentId: activeTournamentId,
    groups,
  };
}
