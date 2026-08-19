import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCaptureLagGroupsForRound,
  loadTodayRoundsAcrossTournaments,
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
} from "@/lib/ritmo/opsDay";
import {
  marshalAccessibleTournamentIds,
  type MarshalProfile,
} from "@/lib/marshal/resolveMarshal";
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
  const accessible = await marshalAccessibleTournamentIds(admin, marshal);

  const allSlots = await loadTodayRoundsAcrossTournaments(admin, today);
  const slots = allSlots.filter((s) => accessible.has(s.tournament.id));

  const tournamentMap = new Map<
    string,
    {
      id: string;
      name: string;
      settings: unknown;
    }
  >();

  // Torneos del club accesibles al marshal (oficial + prueba, etc.).
  const accessibleIds = Array.from(accessible);
  if (accessibleIds.length > 0) {
    const { data: accessibleRows } = await admin
      .from("tournaments")
      .select("id, name, short_name, settings, is_archived")
      .in("id", accessibleIds)
      .neq("is_archived", true);
    for (const row of accessibleRows ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      if (!id) continue;
      tournamentMap.set(id, {
        id,
        name:
          (row as { short_name?: string | null }).short_name ??
          (row as { name?: string | null }).name ??
          "Torneo",
        settings: (row as { settings?: unknown }).settings ?? null,
      });
    }
  }

  for (const slot of slots) {
    if (!tournamentMap.has(slot.tournament.id)) {
      tournamentMap.set(slot.tournament.id, {
        id: slot.tournament.id,
        name: slot.tournament.name,
        settings: null,
      });
    }
  }

  const tournamentIds = Array.from(tournamentMap.keys());
  const needsSettings = tournamentIds.filter(
    (id) => tournamentMap.get(id)?.settings == null
  );
  if (needsSettings.length > 0) {
    const { data: formatRows } = await admin
      .from("tournaments")
      .select("id, settings")
      .in("id", needsSettings);
    for (const row of formatRows ?? []) {
      const id = String((row as { id?: string }).id ?? "");
      const existing = tournamentMap.get(id);
      if (!existing) continue;
      existing.settings = (row as { settings?: unknown }).settings ?? null;
    }
  }

  const tournaments: MarshalTournamentOption[] = Array.from(tournamentMap.values())
    .map((t) => ({
      id: t.id,
      name: t.name,
      liveResultsPath: buildLiveResultsUrl({
        tournamentId: t.id,
        settings: (t.settings ?? null) as TournamentSettings | null,
      }),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  let activeTournamentId = String(selectedTournamentId ?? "").trim();
  if (activeTournamentId && !accessible.has(activeTournamentId)) {
    activeTournamentId = "";
  }
  if (!activeTournamentId && tournaments.length === 1) {
    activeTournamentId = tournaments[0].id;
  }
  // Preferir torneo oficial Calcuta si hay varios y no eligió uno.
  if (!activeTournamentId && tournaments.length > 1) {
    const official = tournaments.find((t) =>
      /calcuta de parejas varonil/i.test(t.name) &&
      !/^prueba/i.test(t.name)
    );
    if (official) activeTournamentId = official.id;
  }

  const paceCache = new Map<string, PerHoleMinutes>();
  const groups: CaptureLagGroupRow[] = [];

  const slotsToLoad = activeTournamentId
    ? slots.filter((s) => s.tournament.id === activeTournamentId)
    : slots;

  async function appendLagForSlot(slot: (typeof slots)[number]) {
    const cacheKey = slot.tournament.courseId ?? `__${slot.tournament.id}`;
    let per = paceCache.get(cacheKey);
    if (!per) {
      per = await loadPerHoleMinutes(admin, slot.tournament.courseId);
      paceCache.set(cacheKey, per);
    }
    const rows = await loadCaptureLagGroupsForRound(admin, {
      tournamentId: slot.tournament.id,
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
      perHoleMinutes: per,
    });
    groups.push(...rows);
  }

  for (const slot of slotsToLoad) {
    await appendLagForSlot(slot);
  }

  // Torneo elegido por URL pero sin ronda calendarizada hoy: carga ronda viva.
  if (activeTournamentId && slotsToLoad.length === 0) {
    const meta = tournamentMap.get(activeTournamentId);
    const { data: tRow } = await admin
      .from("tournaments")
      .select("id, name, short_name, course_name, course_id, start_date, end_date")
      .eq("id", activeTournamentId)
      .maybeSingle();
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
      tournamentEndDate: (tRow?.end_date as string | null) ?? null,
      tournamentStartDate: (tRow?.start_date as string | null) ?? null,
      activityRoundIds,
    });
    if (round && tRow) {
      const courseId = (tRow.course_id as string | null) ?? null;
      let per = paceCache.get(courseId ?? `__${activeTournamentId}`);
      if (!per) {
        per = await loadPerHoleMinutes(admin, courseId);
        paceCache.set(courseId ?? `__${activeTournamentId}`, per);
      }
      const opsRoundDate =
        resolveOpsRoundDate({
          roundDate: round.round_date,
          today,
          liveCaptureToday: activityRoundIds.has(round.id),
        }) ?? today;
      const rows = await loadCaptureLagGroupsForRound(admin, {
        tournamentId: activeTournamentId,
        tournamentName:
          meta?.name ??
          (tRow.short_name as string | null) ??
          (tRow.name as string | null) ??
          "Torneo",
        courseName: (tRow.course_name as string | null) ?? null,
        courseId,
        roundId: round.id,
        roundNo: round.round_no,
        roundDate: round.round_date,
        opsRoundDate,
        tournamentEndDate: (tRow.end_date as string | null) ?? null,
        tournamentStartDate: (tRow.start_date as string | null) ?? null,
        now,
        perHoleMinutes: per,
      });
      groups.push(...rows);
    }
  }

  const byId = new Map<string, CaptureLagGroupRow>();
  for (const g of groups) byId.set(g.id, g);

  return {
    marshalName: marshal.name,
    today,
    computedAtISO,
    tournaments,
    selectedTournamentId: activeTournamentId || null,
    groups: Array.from(byId.values()),
  };
}
