import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/utils/supabase/admin";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { loadCourseLayoutForTournament } from "@/lib/matchplay/loadCourseLayout";
import { loadBracketView } from "@/lib/matchplay/loadBracketView";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { formatPlayerName, effectiveEntryHi } from "@/lib/matchplay/entryHi";
import {
  effectivePhForMatchEntry,
  hiForMatchEntry,
  type MatchEntryPhRow,
} from "@/lib/matchplay/resolveEntryPhForMatch";
import { roundLabel } from "@/lib/matchplay/bracketUtils";
import { pairLowHighStrokes } from "@/lib/matchplay/scoring/lowHigh";
import {
  strokeIndexForHole,
  strokesReceivedOnHole,
  type StrokeIndexByHole,
} from "@/lib/leaderboard/handicapStrokes";
import { getConsolationBracketId } from "@/lib/matchplay/consolationMatchPlay";
import { loadStrokeAggregateStandings } from "@/lib/matchplay/strokeAggregateStandings";
import { MATCHPLAY_PAIR_FORMAT_LABELS } from "@/lib/matchplay/types";
import type { MatchPlayEntryRow, MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";

export type PrintablePlayerRow = {
  name: string;
  gender: "M" | "F" | "X";
  hi: number;
  ph: number | null;
  teeName: string | null;
  teeColor: string | null;
  /** Bola baja o alta dentro de la pareja (formato low_high). */
  ballRole: "baja" | "alta";
  /** Golpes de ventaja recibidos por hoyo (0, 1, 2). Marca el punto en la tarjeta. */
  strokesByHole: Record<number, number>;
};

export type PrintableMatchPlayCard = {
  cardId: string;
  kind: "main" | "consolation_mp";
  matchId: string;
  roundNo: number;
  roundLabel: string;
  positionNo: number;
  groupNo: number | null;
  teeTime: string | null;
  topLabel: string;
  bottomLabel: string;
  topPlayers: PrintablePlayerRow[];
  bottomPlayers: PrintablePlayerRow[];
};

export type PrintableStrokeCard = {
  cardId: string;
  kind: "stroke_aggregate";
  groupId: string;
  roundNo: number;
  groupNo: number;
  teeTime: string | null;
  groupLabel: string;
  players: PrintablePlayerRow[];
};

export type PrintableScorecardsBundle = {
  ok: boolean;
  message: string;
  tournamentId: string;
  tournamentName: string;
  clubName: string;
  clubId: string | null;
  allowancePct: number;
  pairFormatLabel: string;
  parByHole: Record<number, number>;
  strokeIndexByHole: Record<number, number>;
  roundNos: number[];
  matchPlayCards: PrintableMatchPlayCard[];
  strokeCards: PrintableStrokeCard[];
};

type TeeSetLite = {
  id: string;
  name: string | null;
  code: string | null;
  color: string | null;
};

type TeeRuleLite = {
  category_id: string;
  tee_set_id: string;
  priority: number | null;
  age_min: number | null;
  age_max: number | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
};

function mapToRecord(m: Map<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const [k, v] of m) out[k] = v;
  return out;
}

function entryPhRow(entry: MatchPlayEntryRow): MatchEntryPhRow {
  return {
    id: entry.id,
    player_id: entry.player_id,
    category_id: entry.category_id,
    handicap_index: entry.handicap_index,
    playing_handicap: entry.playing_handicap,
    playing_handicap_override: entry.playing_handicap_override,
    player: {
      gender: entry.player.gender,
      handicap_index: entry.player.handicap_index,
      handicap_torneo: null,
    },
  };
}

function buildResolveTee(
  teeSetById: Map<string, TeeSetLite>,
  teeRules: TeeRuleLite[],
  birthYearByPlayerId: Map<string, number | null>
) {
  return (entry: MatchPlayEntryRow | null): {
    teeName: string | null;
    teeColor: string | null;
  } => {
    if (!entry) return { teeName: null, teeColor: null };
    const categoryId = entry.category_id;
    if (!categoryId) return { teeName: null, teeColor: null };
    const birthYear = birthYearByPlayerId.get(entry.player_id) ?? null;
    const age =
      birthYear != null && birthYear > 0
        ? new Date().getFullYear() - birthYear
        : null;
    const hi = entry.handicap_index ?? entry.player.handicap_index ?? null;
    const pg = (entry.player.gender ?? "X") as "M" | "F" | "X";
    const candidates = teeRules
      .filter((r) => r.category_id === categoryId)
      .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
    for (const r of candidates) {
      if (r.gender && r.gender !== pg) continue;
      if (r.age_min != null && (age == null || age < r.age_min)) continue;
      if (r.age_max != null && (age == null || age > r.age_max)) continue;
      if (r.handicap_min != null && (hi == null || hi < r.handicap_min)) continue;
      if (r.handicap_max != null && (hi == null || hi > r.handicap_max)) continue;
      const tee = teeSetById.get(r.tee_set_id);
      if (tee) return { teeName: tee.name, teeColor: tee.color };
    }
    return { teeName: null, teeColor: null };
  };
}

function teamToPrintablePlayers(
  team: MatchPlayTeamRow | null | undefined,
  resolveTee: ReturnType<typeof buildResolveTee>,
  handicapCtx: Awaited<ReturnType<typeof loadTournamentHandicapContext>>
): PrintablePlayerRow[] {
  const entries = [team?.player_a, team?.player_b].filter(Boolean) as MatchPlayEntryRow[];
  const rows = entries.map((entry) => {
    const tee = resolveTee(entry);
    const gender = (entry.player.gender ?? "X") as "M" | "F" | "X";
    return {
      name: formatPlayerName(entry.player),
      gender,
      hi: hiForMatchEntry(entryPhRow(entry)),
      ph: effectivePhForMatchEntry(entryPhRow(entry), handicapCtx),
      teeName: tee.teeName,
      teeColor: tee.teeColor,
      ballRole: "baja" as const,
      _sortHi: hiForMatchEntry(entryPhRow(entry)),
    };
  });
  rows.sort((a, b) => a._sortHi - b._sortHi);
  return rows.map((r, i) => ({
    name: r.name,
    gender: r.gender,
    hi: r.hi,
    ph: r.ph,
    teeName: r.teeName,
    teeColor: r.teeColor,
    ballRole: i === 0 ? ("baja" as const) : ("alta" as const),
    strokesByHole: {},
  }));
}

/**
 * Calcula las ventajas (golpes recibidos) por hoyo para un match Bola Baja +
 * Alta y las escribe en `strokesByHole` de cada jugador. Las ventajas son
 * relativas entre las dos parejas (carril bajo vs bajo, alto vs alto).
 */
function fillLowHighStrokes(
  topPlayers: PrintablePlayerRow[],
  bottomPlayers: PrintablePlayerRow[],
  strokeIndexByHole: StrokeIndexByHole
) {
  if (topPlayers.length < 2 || bottomPlayers.length < 2) return;
  const ph: [number, number, number, number] = [
    Number(topPlayers[0].ph ?? 0),
    Number(topPlayers[1].ph ?? 0),
    Number(bottomPlayers[0].ph ?? 0),
    Number(bottomPlayers[1].ph ?? 0),
  ];
  const relative = pairLowHighStrokes(ph);
  const targets = [
    topPlayers[0],
    topPlayers[1],
    bottomPlayers[0],
    bottomPlayers[1],
  ];
  targets.forEach((player, i) => {
    const byHole: Record<number, number> = {};
    for (let hole = 1; hole <= 18; hole++) {
      const si = strokeIndexForHole(hole, strokeIndexByHole);
      const received = strokesReceivedOnHole(relative[i], si);
      if (received > 0) byHole[hole] = received;
    }
    player.strokesByHole = byHole;
  });
}

async function loadTeeContext(admin: SupabaseClient, tournamentId: string) {
  const [{ data: teeSets }, { data: teeRules }, { data: entries }] =
    await Promise.all([
      admin
        .from("tee_sets")
        .select("id, name, code, color")
        .eq("tournament_id", tournamentId),
      admin
        .from("category_tee_rules")
        .select(
          "category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
        )
        .eq("tournament_id", tournamentId),
      admin
        .from("tournament_entries")
        .select("player_id, players(birth_year)")
        .eq("tournament_id", tournamentId),
    ]);

  const teeSetById = new Map(
    (teeSets ?? []).map((t) => [
      String(t.id),
      {
        id: String(t.id),
        name: t.name ?? null,
        code: t.code ?? null,
        color: t.color ?? null,
      },
    ])
  );

  const birthYearByPlayerId = new Map<string, number | null>();
  for (const e of entries ?? []) {
    const p = Array.isArray(e.players) ? e.players[0] : e.players;
    birthYearByPlayerId.set(
      String(e.player_id),
      (p as { birth_year?: number | null } | null)?.birth_year ?? null
    );
  }

  return {
    resolveTee: buildResolveTee(
      teeSetById,
      (teeRules ?? []) as TeeRuleLite[],
      birthYearByPlayerId
    ),
  };
}

async function loadTeeTimesByRound(
  admin: SupabaseClient,
  tournamentId: string
): Promise<Map<string, { groupNo: number; teeTime: string | null }>> {
  const map = new Map<string, { groupNo: number; teeTime: string | null }>();
  const { data: rounds } = await admin
    .from("rounds")
    .select("id, round_no")
    .eq("tournament_id", tournamentId);
  const roundIds = (rounds ?? []).map((r) => String(r.id));
  if (roundIds.length === 0) return map;

  const { data: groups } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no, tee_time")
    .in("round_id", roundIds);

  const roundNoById = new Map(
    (rounds ?? []).map((r) => [String(r.id), Number(r.round_no)])
  );

  for (const g of groups ?? []) {
    const roundNo = roundNoById.get(String(g.round_id));
    if (roundNo == null) continue;
    const key = `${roundNo}-${g.group_no}`;
    map.set(key, {
      groupNo: Number(g.group_no),
      teeTime: g.tee_time ? String(g.tee_time).slice(0, 5) : null,
    });
  }
  return map;
}

function buildMatchCard(params: {
  kind: "main" | "consolation_mp";
  matchId: string;
  roundNo: number;
  roundCount: number;
  bracketSize: number;
  positionNo: number;
  topTeam: MatchPlayTeamRow | null | undefined;
  bottomTeam: MatchPlayTeamRow | null | undefined;
  topLabel: string;
  bottomLabel: string;
  resolveTee: ReturnType<typeof buildResolveTee>;
  handicapCtx: Awaited<ReturnType<typeof loadTournamentHandicapContext>>;
  strokeIndexByHole: StrokeIndexByHole;
  teeTime: string | null;
}): PrintableMatchPlayCard | null {
  if (!params.topTeam || !params.bottomTeam) return null;
  const topPlayers = teamToPrintablePlayers(
    params.topTeam,
    params.resolveTee,
    params.handicapCtx
  );
  const bottomPlayers = teamToPrintablePlayers(
    params.bottomTeam,
    params.resolveTee,
    params.handicapCtx
  );
  fillLowHighStrokes(topPlayers, bottomPlayers, params.strokeIndexByHole);
  return {
    cardId: `${params.kind}-${params.matchId}`,
    kind: params.kind,
    matchId: params.matchId,
    roundNo: params.roundNo,
    roundLabel: roundLabel(
      params.roundNo,
      params.roundCount,
      params.bracketSize
    ),
    positionNo: params.positionNo,
    groupNo: params.positionNo,
    teeTime: params.teeTime,
    topLabel: params.topLabel,
    bottomLabel: params.bottomLabel,
    topPlayers,
    bottomPlayers,
  };
}

export async function loadPrintableMpScorecards(
  tournamentId: string
): Promise<PrintableScorecardsBundle> {
  const admin = createAdminClient();
  const empty = (msg: string): PrintableScorecardsBundle => ({
    ok: false,
    message: msg,
    tournamentId,
    tournamentName: "",
    clubName: "",
    clubId: null,
    allowancePct: 80,
    pairFormatLabel: "",
    parByHole: {},
    strokeIndexByHole: {},
    roundNos: [],
    matchPlayCards: [],
    strokeCards: [],
  });

  const { data: tournament } = await admin
    .from("tournaments")
    .select("name, club_name, club_id")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!tournament) return empty("Torneo no encontrado.");

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select("pair_format, handicap_allowance, handicap_allowance_pct")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  if (rules?.pair_format !== "low_high") {
    return empty(
      "Este módulo es para torneos Match Play Bola Baja + Alta (formato CCQ)."
    );
  }

  let allowancePct = 80;
  if (rules.handicap_allowance === "full") allowancePct = 100;
  else if (rules.handicap_allowance === "ninety_five") allowancePct = 95;
  else if (
    rules.handicap_allowance === "custom" &&
    rules.handicap_allowance_pct != null
  ) {
    allowancePct = Number(rules.handicap_allowance_pct);
  }

  const [layout, teamsData, handicapCtx, teeCtx, teeTimes, bracketView] =
    await Promise.all([
      loadCourseLayoutForTournament(admin, tournamentId),
      loadMatchPlayTeamsData(tournamentId),
      loadTournamentHandicapContext(admin, tournamentId),
      loadTeeContext(admin, tournamentId),
      loadTeeTimesByRound(admin, tournamentId),
      loadBracketView(tournamentId),
    ]);

  const teamById = new Map(teamsData.teams.map((t) => [t.id, t]));
  const matchPlayCards: PrintableMatchPlayCard[] = [];

  const bracketSize =
    Number((bracketView?.config_json?.bracket_size as number) ?? 32) || 32;
  const roundCount = bracketView?.roundCount ?? 5;

  if (bracketView) {
    for (const m of bracketView.matches) {
      if (m.status === "bye") continue;
      if (!m.top_pair_id || !m.bottom_pair_id) continue;
      const tee = teeTimes.get(`${m.round_no}-${m.position_no}`);
      const card = buildMatchCard({
        kind: "main",
        matchId: m.id,
        roundNo: m.round_no,
        roundCount,
        bracketSize,
        positionNo: m.position_no,
        topTeam: teamById.get(m.top_pair_id),
        bottomTeam: teamById.get(m.bottom_pair_id),
        topLabel: m.top_label,
        bottomLabel: m.bottom_label,
        resolveTee: teeCtx.resolveTee,
        handicapCtx,
        strokeIndexByHole: layout.strokeIndexByHole,
        teeTime: tee?.teeTime ?? null,
      });
      if (card) matchPlayCards.push(card);
    }
  }

  const consolBracketId = await getConsolationBracketId(admin, tournamentId);
  if (consolBracketId) {
    const { data: consolMatches } = await admin
      .from("matchplay_matches")
      .select(
        "id, round_no, position_no, top_pair_id, bottom_pair_id, status"
      )
      .eq("bracket_id", consolBracketId)
      .neq("status", "bye")
      .order("round_no")
      .order("position_no");

    const consolRoundCount = (consolMatches ?? []).reduce(
      (max, m) => Math.max(max, Number(m.round_no)),
      0
    );

    for (const m of consolMatches ?? []) {
      if (!m.top_pair_id || !m.bottom_pair_id) continue;
      const top = teamById.get(m.top_pair_id);
      const bottom = teamById.get(m.bottom_pair_id);
      const tee = teeTimes.get(`${m.round_no}-${m.position_no}`);
      const card = buildMatchCard({
        kind: "consolation_mp",
        matchId: String(m.id),
        roundNo: Number(m.round_no),
        roundCount: consolRoundCount || roundCount,
        bracketSize: 8,
        positionNo: Number(m.position_no),
        topTeam: top,
        bottomTeam: bottom,
        topLabel: top?.team_name ?? formatPlayerName(top?.player_a?.player ?? {}),
        bottomLabel:
          bottom?.team_name ?? formatPlayerName(bottom?.player_a?.player ?? {}),
        resolveTee: teeCtx.resolveTee,
        handicapCtx,
        strokeIndexByHole: layout.strokeIndexByHole,
        teeTime: tee?.teeTime ?? null,
      });
      if (card) matchPlayCards.push(card);
    }
  }

  const strokeCards: PrintableStrokeCard[] = [];
  const strokeData = await loadStrokeAggregateStandings(admin, tournamentId);
  if (strokeData.ok && strokeData.groups.length > 0) {
    for (const g of strokeData.groups) {
      const players: PrintablePlayerRow[] = g.members.map((m) => {
        const ph = Number(m.playingHandicap ?? 0);
        const byHole: Record<number, number> = {};
        for (let hole = 1; hole <= 18; hole++) {
          const si = strokeIndexForHole(hole, layout.strokeIndexByHole);
          const received = strokesReceivedOnHole(ph, si);
          if (received > 0) byHole[hole] = received;
        }
        return {
          name: m.name,
          gender: (m.gender === "F" ? "F" : m.gender === "M" ? "M" : "X") as
            | "M"
            | "F"
            | "X",
          hi: m.handicapIndex ?? 0,
          ph: m.playingHandicap,
          teeName: null,
          teeColor: null,
          ballRole: "baja" as const,
          strokesByHole: byHole,
        };
      });
      strokeCards.push({
        cardId: `stroke-${g.groupId}`,
        kind: "stroke_aggregate",
        groupId: g.groupId,
        roundNo: strokeData.roundNo ?? 0,
        groupNo: g.groupNo,
        teeTime: g.teeTime ? String(g.teeTime).slice(0, 5) : null,
        groupLabel: g.label,
        players,
      });
    }
  }

  const roundNos = [
    ...new Set([
      ...matchPlayCards.map((c) => c.roundNo),
      ...strokeCards.map((c) => c.roundNo),
    ]),
  ].sort((a, b) => a - b);

  return {
    ok: true,
    message:
      matchPlayCards.length + strokeCards.length > 0
        ? `${matchPlayCards.length} tarjeta(s) MP y ${strokeCards.length} de stroke agregado.`
        : "No hay partidos publicados para imprimir.",
    tournamentId,
    tournamentName: tournament.name ?? "Torneo",
    clubName: tournament.club_name ?? "Club Campestre de Querétaro",
    clubId: (tournament as { club_id: string | null }).club_id ?? null,
    allowancePct,
    pairFormatLabel:
      MATCHPLAY_PAIR_FORMAT_LABELS.low_high ??
      "Bola Baja + Bola Alta (2 pts/hoyo)",
    parByHole: mapToRecord(layout.parByHole),
    strokeIndexByHole: mapToRecord(layout.strokeIndexByHole),
    roundNos,
    matchPlayCards,
    strokeCards,
  };
}
