import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computePace,
  type PerHoleMinutes,
} from "@/lib/telegram/ritmo/paceCalculator";
import {
  gpsStateFromTimestamp,
  loadCaddieByEntry,
  loadGroupCoverageForRound,
  type GroupGpsState,
} from "@/lib/ritmo/groupCoverage";
import {
  loadGroupScoreProgress,
  currentHoleFromHolesPlayed,
  type GroupScoreMeta,
} from "@/lib/ritmo/scoreProgress";
import { resolveGroupStartHole } from "@/lib/ritmo/startHole";
import {
  isOpsRoundClosed,
  isGroupCaptureFinished,
} from "@/lib/ritmo/opsDay";
import {
  loadCompletedMatchplayEntryKeys,
  matchplayEntrySetKey,
} from "@/lib/ritmo/loadCaptureLagGroups";
import type { LiveGroup, LiveStatus } from "@/app/(backoffice)/ritmo/RitmoLiveView";

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
  player_number: number | null;
  players: { first_name: string | null; last_name: string | null } | null;
};

type PositionRow = {
  group_id: string | null;
  lat: number | null;
  lon: number | null;
  hoyo_detectado: number | null;
  ts: string;
  telegram_user_id: string | null;
  player_id: string | null;
};

const STALE_MINUTES = 12;
const LOOKBACK_MINUTES = 90;
const ACTIVE_SOURCE_MINUTES = 5;

function modalHole(holes: (number | null)[]): number | null {
  const counts = new Map<number, number>();
  for (const h of holes) {
    if (h == null) continue;
    counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestN = 0;
  for (const [h, n] of counts) {
    if (n > bestN) {
      best = h;
      bestN = n;
    }
  }
  return best;
}

function fullName(p: EntryRow["players"]): string {
  const full = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`.trim();
  return full || "Jugador";
}

export type RitmoRoundInput = {
  id: string;
  round_no: number | null;
  round_date: string | null;
};

/** Construye filas de ritmo para una ronda del calendario. */
export async function buildRitmoLiveGroupsForRound(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    round: RitmoRoundInput;
    tournamentEndDate: string | null;
    tournamentStartDate: string | null;
    today: string;
    now: Date;
    perHoleMinutes: PerHoleMinutes;
    /** Prefijo en etiqueta (p. ej. "R4 · ") cuando hay varias rondas. */
    labelWithRound: boolean;
  }
): Promise<LiveGroup[]> {
  const { round, tournamentId, now } = args;
  const opsClosed = isOpsRoundClosed({
    roundDate: round.round_date,
    tournamentEndDate: args.tournamentEndDate,
    tournamentStartDate: args.tournamentStartDate,
    today: args.today,
  });

  const { data: groupsRaw } = await admin
    .from("pairing_groups")
    .select("id, group_no, starting_hole, tee_time, actual_start_at, notes")
    .eq("round_id", round.id)
    .order("group_no", { ascending: true });
  const groupRows = (groupsRaw ?? []) as GroupRow[];
  const groupIds = groupRows.map((g) => g.id);
  if (groupIds.length === 0) return [];

  const playersByGroup = new Map<string, string[]>();
  const entryIdsByGroup = new Map<string, string[]>();
  const memberRowsByGroup = new Map<
    string,
    { entryId: string; name: string }[]
  >();

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
      .select("id, player_number, players ( first_name, last_name )")
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
    const rows = memberRowsByGroup.get(m.group_id) ?? [];
    rows.push({ entryId: m.entry_id, name });
    memberRowsByGroup.set(m.group_id, rows);
  }

  const coverageByGroup = await loadGroupCoverageForRound(
    admin,
    tournamentId,
    round.id,
    playersByGroup,
    entryIdsByGroup
  );

  const allEntryIds = Array.from(
    new Set(Array.from(entryIdsByGroup.values()).flat())
  );
  const caddieByEntry = await loadCaddieByEntry(
    admin,
    tournamentId,
    round.id,
    allEntryIds
  );

  const cutoff = new Date(
    Date.now() - LOOKBACK_MINUTES * 60 * 1000
  ).toISOString();
  const positionsByGroup = new Map<string, PositionRow[]>();
  const { data: posRaw } = await admin
    .from("ritmo_positions")
    .select(
      "group_id, lat, lon, hoyo_detectado, ts, telegram_user_id, player_id"
    )
    .eq("tournament_id", tournamentId)
    .eq("round_id", round.id)
    .in("group_id", groupIds)
    .gte("ts", cutoff)
    .order("ts", { ascending: false });
  for (const row of (posRaw ?? []) as PositionRow[]) {
    if (!row.group_id) continue;
    const arr = positionsByGroup.get(row.group_id) ?? [];
    arr.push(row);
    positionsByGroup.set(row.group_id, arr);
  }

  const groupMeta = new Map<string, GroupScoreMeta>(
    groupRows.map((g) => [
      g.id,
      { starting_hole: g.starting_hole, notes: g.notes },
    ])
  );

  const scoreByGroup = await loadGroupScoreProgress(
    admin,
    round.id,
    entryIdsByGroup,
    groupMeta
  );

  const completedMatchByEntries = await loadCompletedMatchplayEntryKeys(
    admin,
    tournamentId
  );

  const roundPrefix =
    args.labelWithRound && round.round_no != null
      ? `R${round.round_no} · `
      : "";

  return groupRows.map((g) => {
    const players = playersByGroup.get(g.id) ?? [];
    const positions = positionsByGroup.get(g.id) ?? [];
    const latest = positions[0] ?? null;
    const gpsHole = modalHole(
      positions.slice(0, 10).map((p) => p.hoyo_detectado)
    );

    const lastTs = latest?.ts ?? null;
    const stale = lastTs
      ? now.getTime() - new Date(lastTs).getTime() > STALE_MINUTES * 60 * 1000
      : false;

    const score = scoreByGroup.get(g.id);
    const startHole =
      score?.startHole ?? resolveGroupStartHole(g.starting_hole, g.notes);
    const scoreHolesPlayed = score?.holesPlayed ?? 0;
    const scoreFinished = isGroupCaptureFinished(scoreHolesPlayed);
    const scoreHole = score
      ? currentHoleFromHolesPlayed(scoreHolesPlayed, startHole)
      : null;
    const groupEntryKey = matchplayEntrySetKey(entryIdsByGroup.get(g.id) ?? []);
    const matchResult = completedMatchByEntries.get(groupEntryKey) ?? null;
    const matchplayCompleted = completedMatchByEntries.has(groupEntryKey);

    const label = `${roundPrefix}Grupo ${g.group_no ?? "?"}`;
    const playerRows = (memberRowsByGroup.get(g.id) ?? []).map((row) => {
      const caddie = caddieByEntry.get(row.entryId) ?? null;
      return {
        name: row.name,
        caddieName: caddie?.name ?? null,
        caddieHasTelegram: caddie?.hasTelegram ?? false,
      };
    });
    const coverage = coverageByGroup.get(g.id);
    const gpsState: GroupGpsState = gpsStateFromTimestamp(
      lastTs,
      STALE_MINUTES,
      now
    );

    if (opsClosed || scoreFinished || matchplayCompleted) {
      const detail = matchplayCompleted
        ? `🏁 Match cerrado${matchResult ? ` · ${matchResult}` : ""} — ritmo detenido`
        : scoreFinished
          ? "🏁 18 hoyos capturados — salida cerrada, ritmo detenido"
          : `Ronda/torneo cerrado · ${scoreHolesPlayed}/18 capturados (ritmo no se actualiza)`;
      return {
        id: g.id,
        number: g.group_no ?? 0,
        roundId: round.id,
        roundNo: round.round_no,
        roundDate: round.round_date,
        label,
        startingHole: startHole,
        teeTime: g.tee_time,
        actualStartAt: g.actual_start_at,
        players,
        playerRows,
        status: "cerrado" as LiveStatus,
        hoyo: scoreHole,
        holeSource: scoreHolesPlayed > 0 ? "scores" : null,
        detail,
        deltaMinutes: null,
        lat: latest?.lat ?? null,
        lon: latest?.lon ?? null,
        lastTs,
        stale,
        gpsState,
        activeSources: 0,
        scoreHolesPlayed,
        scoreFinished: scoreFinished || matchplayCompleted,
        lastScoreTs: score?.lastCaptureTs ?? null,
        caddies: coverage?.caddies ?? [],
        playersWithTelegram: coverage?.playersWithTelegram ?? 0,
        playerCount: coverage?.playerCount ?? players.length,
      };
    }

    let hoyoActual: number | null;
    let holeSource: "scores" | "gps" | null;
    if (scoreHole != null) {
      hoyoActual = scoreHole;
      holeSource = "scores";
    } else if (!stale && gpsHole != null) {
      hoyoActual = gpsHole;
      holeSource = "gps";
    } else {
      hoyoActual = null;
      holeSource = null;
    }

    const pace = computePace({
      hoyoActual,
      teeTimeISO: g.tee_time,
      actualStartISO: g.actual_start_at,
      teeStartHole: startHole,
      roundDate: round.round_date,
      now,
      perHoleMinutes: args.perHoleMinutes,
    });

    let status: LiveStatus;
    let deltaMinutes: number | null = null;
    if (hoyoActual == null) {
      status = "sin_datos";
    } else if (
      pace.kind === "en_ritmo" ||
      pace.kind === "adelantado" ||
      pace.kind === "atrasado"
    ) {
      status = pace.kind;
      deltaMinutes = pace.deltaMinutes;
    } else {
      status = "en_ritmo";
    }

    const activeSinceMs =
      now.getTime() - ACTIVE_SOURCE_MINUTES * 60 * 1000;
    const recentDevices = new Set<string>();
    for (const p of positions) {
      const ts = new Date(p.ts).getTime();
      if (!Number.isFinite(ts) || ts < activeSinceMs) continue;
      const key =
        (p.telegram_user_id && `tg:${p.telegram_user_id}`) ||
        (p.player_id && `pl:${p.player_id}`) ||
        null;
      if (key) recentDevices.add(key);
    }

    const detail =
      holeSource === "scores" || holeSource === "gps"
        ? pace.msg
        : score && score.lastCaptureTs
          ? "Captura iniciada, detectando avance…"
          : gpsState === "none"
            ? "Sin GPS ni escores aún — el caddie aún no captura y nadie comparte ubicación."
            : "Sin ubicación ni captura todavía.";

    return {
      id: g.id,
      number: g.group_no ?? 0,
      roundId: round.id,
      roundNo: round.round_no,
      roundDate: round.round_date,
      label,
      startingHole: startHole,
      teeTime: g.tee_time,
      actualStartAt: g.actual_start_at,
      players,
      playerRows,
      status,
      hoyo: hoyoActual,
      holeSource,
      detail,
      deltaMinutes,
      lat: latest?.lat ?? null,
      lon: latest?.lon ?? null,
      lastTs,
      stale,
      gpsState,
      activeSources: recentDevices.size,
      scoreHolesPlayed,
      scoreFinished,
      lastScoreTs: score?.lastCaptureTs ?? null,
      caddies: coverage?.caddies ?? [],
      playersWithTelegram: coverage?.playersWithTelegram ?? 0,
      playerCount: coverage?.playerCount ?? players.length,
    };
  });
}
