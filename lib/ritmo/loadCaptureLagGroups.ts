import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadPerHoleMinutes,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import { loadGroupCoverageForRound } from "@/lib/ritmo/groupCoverage";
import {
  loadGroupScoreProgress,
  type GroupScoreMeta,
} from "@/lib/ritmo/scoreProgress";
import { resolveGroupStartHole } from "@/lib/ritmo/startHole";
import { evaluateCaptureLag } from "@/lib/ritmo/captureLag";
import {
  isOpsRoundClosed,
  mexicoDayUtcBounds,
  resolveOpsRoundDate,
  todayMexicoDate,
} from "@/lib/ritmo/opsDay";
import { buildScoreEntryHref } from "@/lib/score-entry/scoreEntryUrl";
import type { CaptureLagKind } from "@/lib/ritmo/captureLag";
import {
  loadActiveCapturersByGroup,
  type ActiveCapturer,
} from "@/lib/ritmo/activeCapturers";

export type CaptureLagGroupRow = {
  id: string;
  number: number;
  label: string;
  startingHole: number;
  teeTime: string | null;
  actualStartAt: string | null;
  players: string[];
  caddies: string[];
  /** Quién está capturando en esta ronda (bitácora, no Telegram). */
  capturers: ActiveCapturer[];
  holesPlayed: number;
  lastHole: number | null;
  lastCaptureTs: string | null;
  kind: CaptureLagKind;
  expectedHoles: number;
  holesBehind: number;
  minutesSinceStart: number | null;
  minutesSinceLastCapture: number | null;
  captureHole: number | null;
  expectedHole: number | null;
  /** Minutos de retraso vs ritmo del campo (positivo = lento). */
  paceDelayMinutes: number | null;
  reason: string;
  priority: number;
  capturaHref: string;
  scoreEntryHref: string;
  tournamentId: string;
  tournamentName: string;
  courseName: string | null;
  roundId: string;
  roundNo: number | null;
};

type GroupRow = {
  id: string;
  group_no: number | null;
  starting_hole: number | null;
  tee_time: string | null;
  actual_start_at: string | null;
  notes: string | null;
};

type MemberRow = { group_id: string; entry_id: string };

type EntryRow = {
  id: string;
  players: { first_name: string | null; last_name: string | null } | null;
};

function fullName(p: EntryRow["players"]): string {
  const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return full || "Jugador";
}

/** Carga grupos + retraso de captura para una ronda de un torneo. */
export async function loadCaptureLagGroupsForRound(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    tournamentName: string;
    courseName: string | null;
    courseId: string | null;
    roundId: string;
    roundNo: number | null;
    roundDate: string | null;
    /** Fecha para tee times / reloj (p. ej. hoy si hay captura en vivo). */
    opsRoundDate?: string | null;
    tournamentEndDate?: string | null;
    tournamentStartDate?: string | null;
    now?: Date;
    perHoleMinutes?: PerHoleMinutes | null;
  }
): Promise<CaptureLagGroupRow[]> {
  const now = args.now ?? new Date();
  const today = todayMexicoDate(now);
  const lagRoundDate =
    args.opsRoundDate ??
    resolveOpsRoundDate({
      roundDate: args.roundDate,
      today,
      liveCaptureToday: false,
    });
  const perHoleMinutes =
    args.perHoleMinutes ??
    (await loadPerHoleMinutes(admin, args.courseId));

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, group_no, starting_hole, tee_time, actual_start_at, notes")
    .eq("round_id", args.roundId)
    .order("group_no", { ascending: true });
  const groupRows = (groupsRaw ?? []) as GroupRow[];
  if (groupRows.length === 0) return [];

  const groupIds = groupRows.map((g) => g.id);
  const playersByGroup = new Map<string, string[]>();
  const entryIdsByGroup = new Map<string, string[]>();

  const { data: membersRaw } = await admin
    .from("pairing_group_members")
    .select("group_id, entry_id")
    .in("group_id", groupIds);
  const members = (membersRaw ?? []) as MemberRow[];
  const entryIds = Array.from(new Set(members.map((m) => m.entry_id)));

  const nameByEntry = new Map<string, string>();
  if (entryIds.length > 0) {
    const { data: entriesRaw } = await admin
      .from("tournament_entries")
      .select("id, players ( first_name, last_name )")
      .in("id", entryIds);
    for (const e of (entriesRaw ?? []) as unknown as EntryRow[]) {
      const p = Array.isArray(e.players) ? e.players[0] : e.players;
      nameByEntry.set(e.id, fullName(p ?? null));
    }
  }
  for (const m of members) {
    const name = nameByEntry.get(m.entry_id) ?? "Jugador";
    const arr = playersByGroup.get(m.group_id) ?? [];
    arr.push(name);
    playersByGroup.set(m.group_id, arr);
    const eids = entryIdsByGroup.get(m.group_id) ?? [];
    eids.push(m.entry_id);
    entryIdsByGroup.set(m.group_id, eids);
  }

  const coverageByGroup = await loadGroupCoverageForRound(
    admin,
    args.tournamentId,
    args.roundId,
    playersByGroup,
    entryIdsByGroup
  );

  const groupMeta = new Map<string, GroupScoreMeta>(
    groupRows.map((g) => [
      g.id,
      { starting_hole: g.starting_hole, notes: g.notes },
    ])
  );

  const scoreByGroup = await loadGroupScoreProgress(
    admin,
    args.roundId,
    entryIdsByGroup,
    groupMeta
  );

  const capturersByGroup = await loadActiveCapturersByGroup(
    admin,
    args.roundId,
    entryIdsByGroup
  );

  return groupRows.map((g) => {
    const players = playersByGroup.get(g.id) ?? [];
    const score = scoreByGroup.get(g.id);
    const startHole =
      score?.startHole ?? resolveGroupStartHole(g.starting_hole, g.notes);
    const holesPlayed = score?.holesPlayed ?? 0;
    const lag = evaluateCaptureLag({
      holesPlayed,
      lastCaptureTs: score?.lastCaptureTs ?? null,
      firstCaptureTs: score?.firstCaptureTs ?? null,
      teeTimeISO: g.tee_time,
      actualStartISO: g.actual_start_at,
      startHole,
      roundDate: lagRoundDate,
      tournamentEndDate: args.tournamentEndDate,
      tournamentStartDate: args.tournamentStartDate,
      perHoleMinutes,
      now,
    });
    const coverage = coverageByGroup.get(g.id);
    const firstEntry = entryIdsByGroup.get(g.id)?.[0] ?? null;

    return {
      id: g.id,
      number: g.group_no ?? 0,
      label: `Grupo ${g.group_no ?? "?"}`,
      startingHole: startHole,
      teeTime: g.tee_time,
      actualStartAt: g.actual_start_at,
      players,
      caddies: (coverage?.caddies ?? []).map((c) => c.name),
      capturers: capturersByGroup.get(g.id) ?? [],
      holesPlayed,
      lastHole: score?.lastHole ?? null,
      lastCaptureTs: score?.lastCaptureTs ?? null,
      kind: lag.kind,
      expectedHoles: lag.expectedHoles,
      holesBehind: lag.holesBehind,
      minutesSinceStart: lag.minutesSinceStart,
      minutesSinceLastCapture: lag.minutesSinceLastCapture,
      captureHole: lag.captureHole,
      expectedHole: lag.expectedHole,
      paceDelayMinutes: lag.paceDelayMinutes,
      reason: lag.reason,
      priority: lag.priority,
      capturaHref: `/captura/grupo?group_id=${encodeURIComponent(g.id)}`,
      scoreEntryHref: buildScoreEntryHref({
        tournamentId: args.tournamentId,
        entryId: firstEntry,
        roundNo: args.roundNo,
      }),
      tournamentId: args.tournamentId,
      tournamentName: args.tournamentName,
      courseName: args.courseName,
      roundId: args.roundId,
      roundNo: args.roundNo,
    };
  });
}

export type TournamentBrief = {
  id: string;
  name: string;
  courseName: string | null;
  courseId: string | null;
  startDate: string | null;
  endDate: string | null;
};

type RoundWithTournamentRow = {
  id: string;
  round_no: number | null;
  round_date: string | null;
  tournament_id: string;
  tournaments:
    | {
        id: string;
        name: string | null;
        short_name: string | null;
        course_name: string | null;
        course_id: string | null;
        is_archived: boolean | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
      }
    | {
        id: string;
        name: string | null;
        short_name: string | null;
        course_name: string | null;
        course_id: string | null;
        is_archived: boolean | null;
        status: string | null;
        start_date: string | null;
        end_date: string | null;
      }[]
    | null;
};

function tournamentFromRoundRow(
  row: RoundWithTournamentRow
): TournamentBrief | null {
  const t = Array.isArray(row.tournaments)
    ? row.tournaments[0]
    : row.tournaments;
  if (!t?.id) return null;
  if (t.is_archived) return null;
  const name =
    (t.short_name && String(t.short_name).trim()) ||
    (t.name && String(t.name).trim()) ||
    "Torneo";
  return {
    id: t.id,
    name,
    courseName: t.course_name ?? null,
    courseId: t.course_id ?? null,
    startDate: t.start_date ?? null,
    endDate: t.end_date ?? null,
  };
}

function isRoundSlotClosed(
  row: Pick<RoundWithTournamentRow, "round_date">,
  tournament: TournamentBrief,
  today: string
): boolean {
  return isOpsRoundClosed({
    roundDate: row.round_date,
    tournamentEndDate: tournament.endDate,
    tournamentStartDate: tournament.startDate,
    today,
  });
}

/** Rondas con al menos una captura hoy (México), p. ej. prueba con round_date futuro. */
export async function loadRoundIdsWithCaptureActivityToday(
  admin: SupabaseClient,
  today: string
): Promise<Set<string>> {
  const { startIso, endIso } = mexicoDayUtcBounds(today);
  const { data } = await admin
    .from("hole_score_audit")
    .select("round_id")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .not("round_id", "is", null)
    .limit(5000);
  const ids = new Set<string>();
  for (const row of (data ?? []) as { round_id: string | null }[]) {
    if (row.round_id) ids.add(row.round_id);
  }
  return ids;
}

/**
 * Rondas con juego "hoy" (México): una ronda por torneo (preferida la de
 * round_date = hoy; si hay varias categorías el mismo día, todas con
 * groups). También incluye rondas con capturas en vivo hoy aunque round_date
 * sea futuro (torneos de prueba o salida adelantada).
 */
export async function loadTodayRoundsAcrossTournaments(
  admin: SupabaseClient,
  today: string,
  onlyTournamentId?: string | null
): Promise<
  Array<{
    tournament: TournamentBrief;
    roundId: string;
    roundNo: number | null;
    roundDate: string | null;
    opsRoundDate: string;
  }>
> {
  let q = admin
    .from("rounds")
    .select(
      "id, round_no, round_date, tournament_id, tournaments ( id, name, short_name, course_name, course_id, is_archived, status, start_date, end_date )"
    )
    .eq("round_date", today)
    .order("round_no", { ascending: true });

  if (onlyTournamentId) {
    q = q.eq("tournament_id", onlyTournamentId);
  }

  const { data: calendarRows } = await q;
  const activityRoundIds = await loadRoundIdsWithCaptureActivityToday(
    admin,
    today
  );

  const out: Array<{
    tournament: TournamentBrief;
    roundId: string;
    roundNo: number | null;
    roundDate: string | null;
    opsRoundDate: string;
  }> = [];
  const seenRoundIds = new Set<string>();

  for (const row of (calendarRows ?? []) as unknown as RoundWithTournamentRow[]) {
    const tournament = tournamentFromRoundRow(row);
    if (!tournament) continue;
    if (isRoundSlotClosed(row, tournament, today)) continue;
    seenRoundIds.add(row.id);
    out.push({
      tournament,
      roundId: row.id,
      roundNo: row.round_no,
      roundDate: row.round_date,
      opsRoundDate: today,
    });
  }

  const missingActivityIds = Array.from(activityRoundIds).filter(
    (id) => !seenRoundIds.has(id)
  );
  if (missingActivityIds.length > 0) {
    let aq = admin
      .from("rounds")
      .select(
        "id, round_no, round_date, tournament_id, tournaments ( id, name, short_name, course_name, course_id, is_archived, status, start_date, end_date )"
      )
      .in("id", missingActivityIds);
    if (onlyTournamentId) {
      aq = aq.eq("tournament_id", onlyTournamentId);
    }
    const { data: activityRows } = await aq;
    for (const row of (activityRows ?? []) as unknown as RoundWithTournamentRow[]) {
      const tournament = tournamentFromRoundRow(row);
      if (!tournament) continue;
      if (isRoundSlotClosed(row, tournament, today)) continue;
      seenRoundIds.add(row.id);
      out.push({
        tournament,
        roundId: row.id,
        roundNo: row.round_no,
        roundDate: row.round_date,
        opsRoundDate: resolveOpsRoundDate({
          roundDate: row.round_date,
          today,
          liveCaptureToday: true,
        }) ?? today,
      });
    }
  }

  return out;
}
