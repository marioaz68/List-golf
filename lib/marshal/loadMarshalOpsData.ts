import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCaptureLagGroupsForRound,
  loadRoundIdsWithCaptureActivityToday,
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
  toDateOnly,
  type OpsRoundRow,
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

export type MarshalRoundOption = {
  id: string;
  roundNo: number | null;
  roundDate: string | null;
  startTime: string | null;
  label: string;
};

export type MarshalOpsPayload = {
  marshalName: string;
  marshalProfileId: string;
  marshalInitials: string;
  today: string;
  computedAtISO: string;
  tournaments: MarshalTournamentOption[];
  selectedTournamentId: string | null;
  rounds: MarshalRoundOption[];
  selectedRoundId: string | null;
  groups: CaptureLagGroupRow[];
};

function formatRoundLabel(r: OpsRoundRow): string {
  const n = r.round_no != null ? `R${r.round_no}` : "Ronda";
  const t = String(r.start_time ?? "").trim().slice(0, 5);
  return t ? `${n} · ${t}` : n;
}

export async function loadMarshalOpsData(
  admin: SupabaseClient,
  marshal: MarshalProfile,
  selectedTournamentId?: string | null,
  selectedRoundId?: string | null
): Promise<MarshalOpsPayload> {
  const today = todayMexicoDate();
  const now = new Date();
  const computedAtISO = now.toISOString();

  const activeTournamentId = await resolveMarshalDayTournamentId(
    admin,
    marshal,
    selectedTournamentId
  );

  const empty = (extra?: Partial<MarshalOpsPayload>): MarshalOpsPayload => ({
    marshalName: marshal.name,
    marshalProfileId: marshal.profileId,
    marshalInitials: marshal.initials,
    today,
    computedAtISO,
    tournaments: [],
    selectedTournamentId: activeTournamentId,
    rounds: [],
    selectedRoundId: null,
    groups: [],
    ...extra,
  });

  if (!activeTournamentId) {
    return empty({ selectedTournamentId: null });
  }

  const { data: tRow } = await admin
    .from("tournaments")
    .select(
      "id, name, short_name, course_name, course_id, start_date, end_date, settings"
    )
    .eq("id", activeTournamentId)
    .maybeSingle();

  if (!tRow) {
    return empty();
  }

  const tournamentName =
    (tRow.short_name as string | null) ??
    (tRow.name as string | null) ??
    "Torneo";

  const tournaments: MarshalTournamentOption[] = [
    {
      id: activeTournamentId,
      name: tournamentName,
      liveResultsPath: buildLiveResultsUrl({
        tournamentId: activeTournamentId,
        settings: (tRow.settings ?? null) as TournamentSettings | null,
      }),
    },
  ];

  const { data: roundsRaw } = await admin
    .from("rounds")
    .select("id, round_no, round_date, start_time")
    .eq("tournament_id", activeTournamentId)
    .order("round_no", { ascending: true });

  const rounds = (roundsRaw ?? []) as OpsRoundRow[];
  const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(
    admin,
    today
  );

  // Selector: rondas de hoy + la elegida automáticamente (por si es otra fecha).
  const todayRounds = rounds.filter(
    (r) => toDateOnly(r.round_date) === today
  );
  const selectable =
    todayRounds.length > 0
      ? todayRounds
      : rounds.filter((r) => activityRoundIds.has(r.id));
  const roundOptionsSource =
    selectable.length > 0 ? selectable : rounds.slice(0, 3);

  const round = resolveLiveRoundForTournament({
    rounds,
    queryRoundId: selectedRoundId,
    today,
    now,
    tournamentEndDate: (tRow.end_date as string | null) ?? null,
    tournamentStartDate: (tRow.start_date as string | null) ?? null,
    activityRoundIds,
  });

  const roundsOut: MarshalRoundOption[] = roundOptionsSource.map((r) => ({
    id: r.id,
    roundNo: r.round_no,
    roundDate: r.round_date,
    startTime: r.start_time ? String(r.start_time).slice(0, 5) : null,
    label: formatRoundLabel(r),
  }));

  // Asegurar que la ronda activa aparezca en el selector.
  if (round && !roundsOut.some((r) => r.id === round.id)) {
    roundsOut.unshift({
      id: round.id,
      roundNo: round.round_no,
      roundDate: round.round_date,
      startTime: round.start_time
        ? String(round.start_time).slice(0, 5)
        : null,
      label: formatRoundLabel(round),
    });
  }

  const groups: CaptureLagGroupRow[] = [];
  if (round) {
    const perHoleMinutes: PerHoleMinutes = await loadPerHoleMinutes(
      admin,
      (tRow.course_id as string | null) ?? null,
      activeTournamentId
    );
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

  return {
    marshalName: marshal.name,
    marshalProfileId: marshal.profileId,
    marshalInitials: marshal.initials,
    today,
    computedAtISO,
    tournaments,
    selectedTournamentId: activeTournamentId,
    rounds: roundsOut,
    selectedRoundId: round?.id ?? null,
    groups,
  };
}
