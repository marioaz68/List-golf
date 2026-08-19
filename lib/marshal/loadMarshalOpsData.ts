import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCaptureLagGroupsForRound,
  loadTodayRoundsAcrossTournaments,
  type CaptureLagGroupRow,
} from "@/lib/ritmo/loadCaptureLagGroups";
import {
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import { todayMexicoDate } from "@/lib/ritmo/opsDay";
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
  if (tournamentIds.length > 0) {
    const { data: formatRows } = await admin
      .from("tournaments")
      .select("id, settings")
      .in("id", tournamentIds);
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

  const paceCache = new Map<string, PerHoleMinutes>();
  const groups: CaptureLagGroupRow[] = [];

  const slotsToLoad = activeTournamentId
    ? slots.filter((s) => s.tournament.id === activeTournamentId)
    : slots;

  for (const slot of slotsToLoad) {
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
