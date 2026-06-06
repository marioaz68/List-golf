import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { buildLiveStrokeSnapshot } from "@/lib/matchplay/buildLiveStrokeSnapshot";
import {
  CONSOLATION_NOTES_PREFIX,
  getConsolationBracketId,
  loadConsolationMpRule,
} from "@/lib/matchplay/consolationMatchPlay";

export type ConsolationLiveGroup = {
  groupId: string;
  groupNo: number;
  teeTime: string | null;
  roundNo: number;
  matchId: string | null;
  topLabel: string;
  bottomLabel: string;
  resultText: string | null;
  status: string;
  /** Puntos en vivo derivados de captura (ej. "H12 · 2 arriba"). */
  liveText: string | null;
};

type ConsolMatchRow = {
  id: string;
  round_no: number | null;
  position_no: number | null;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string | null;
  result_text: string | null;
};

export type ConsolationMatchPlayPublic = {
  ok: boolean;
  tournamentName: string;
  /** Ronda del calendario donde juega la consolación activa (ej. 4). */
  activeRoundNo: number | null;
  /** Ronda del cuadro principal cuyos perdedores entran (ej. 3). */
  fromRoundNo: number | null;
  groups: ConsolationLiveGroup[];
  message: string;
};

function teamLabel(
  teamId: string | null,
  teamById: Map<string, MatchPlayTeamRow>
): string {
  if (!teamId) return "—";
  const t = teamById.get(teamId);
  if (!t) return "—";
  const seed = t.seed != null ? `#${t.seed} ` : "";
  return `${seed}${t.team_name ?? formatPlayerName(t.player_a?.player ?? {})}`;
}

export async function loadConsolationMatchPlayPublic(
  admin: SupabaseClient,
  tournamentId: string
): Promise<ConsolationMatchPlayPublic> {
  const empty = (msg: string): ConsolationMatchPlayPublic => ({
    ok: false,
    tournamentName: "",
    activeRoundNo: null,
    fromRoundNo: null,
    groups: [],
    message: msg,
  });

  const { data: tournament } = await admin
    .from("tournaments")
    .select("name")
    .eq("id", tournamentId)
    .maybeSingle();
  const tournamentName = tournament?.name ?? "Torneo";

  const rule = await loadConsolationMpRule(admin, tournamentId);
  if (!rule) {
    return {
      ok: true,
      tournamentName,
      activeRoundNo: null,
      fromRoundNo: null,
      groups: [],
      message: "Este torneo no tiene consolación Match Play configurada.",
    };
  }

  const fromRoundNo = rule.from_round_no;
  const activeRoundNo = fromRoundNo + 1;

  const consolBracketId = await getConsolationBracketId(admin, tournamentId);
  if (!consolBracketId) {
    return {
      ok: true,
      tournamentName,
      activeRoundNo,
      fromRoundNo,
      groups: [],
      message:
        "Aún no hay cuadro de consolación. Cierra partidos de la ronda anterior o usa «Consolación Match Play» en backoffice.",
    };
  }

  const teamsData = await loadMatchPlayTeamsData(tournamentId);
  const teamById = new Map<string, MatchPlayTeamRow>();
  for (const t of teamsData.teams) teamById.set(t.id, t);

  const { data: consolMatches } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
    )
    .eq("bracket_id", consolBracketId)
    .order("round_no", { ascending: true })
    .order("position_no", { ascending: true });

  const matchByPairKey = new Map<string, ConsolMatchRow>();
  for (const m of consolMatches ?? []) {
    if (!m.top_pair_id || !m.bottom_pair_id) continue;
    const k = [m.top_pair_id, m.bottom_pair_id].sort().join("|");
    matchByPairKey.set(k, m);
  }

  const snapshot = await buildLiveStrokeSnapshot(admin, tournamentId);
  const liveByMatchId = new Map(
    snapshot.matches.map((m) => [m.id, m.result_text])
  );

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("round_no", activeRoundNo)
    .maybeSingle();

  const groups: ConsolationLiveGroup[] = [];

  if (roundRow?.id) {
    const { data: pgRows } = await admin
      .from("pairing_groups")
      .select("id, group_no, tee_time, notes")
      .eq("round_id", roundRow.id)
      .like("notes", `${CONSOLATION_NOTES_PREFIX}%`)
      .order("group_no", { ascending: true });

    const { data: members } = await admin
      .from("pairing_group_members")
      .select("group_id, entry_id")
      .in("group_id", (pgRows ?? []).map((g) => g.id));

    const { data: pairTeams } = await admin
      .from("matchplay_pair_teams")
      .select("id, player_a_entry_id, player_b_entry_id")
      .eq("tournament_id", tournamentId);

    const entryToTeam = new Map<string, string>();
    for (const t of pairTeams ?? []) {
      if (t.player_a_entry_id) entryToTeam.set(t.player_a_entry_id, String(t.id));
      if (t.player_b_entry_id) entryToTeam.set(t.player_b_entry_id, String(t.id));
    }

    for (const pg of pgRows ?? []) {
      const gTeams = (members ?? [])
        .filter((m) => m.group_id === pg.id)
        .map((m) => entryToTeam.get(m.entry_id))
        .filter((id): id is string => Boolean(id));
      const uniqueTeams = [...new Set(gTeams)];
      let match: ConsolMatchRow | undefined;
      if (uniqueTeams.length >= 2) {
        const k = uniqueTeams.slice(0, 2).sort().join("|");
        match = matchByPairKey.get(k);
      }

      groups.push({
        groupId: String(pg.id),
        groupNo: Number(pg.group_no ?? 0),
        teeTime: pg.tee_time ? String(pg.tee_time).slice(0, 5) : null,
        roundNo: activeRoundNo,
        matchId: match?.id ? String(match.id) : null,
        topLabel: teamLabel(match?.top_pair_id ?? uniqueTeams[0] ?? null, teamById),
        bottomLabel: teamLabel(
          match?.bottom_pair_id ?? uniqueTeams[1] ?? null,
          teamById
        ),
        resultText: match?.result_text ?? null,
        status: match?.status ?? "scheduled",
        liveText: match?.id ? liveByMatchId.get(match.id) ?? null : null,
      });
    }
  }

  // Partidos de consolación en la ronda activa sin salida aún.
  for (const m of consolMatches ?? []) {
    if (Number(m.round_no) !== activeRoundNo) continue;
    if (!m.top_pair_id || !m.bottom_pair_id) continue;
    if (groups.some((g) => g.matchId === m.id)) continue;
    groups.push({
      groupId: `match-${m.id}`,
      groupNo: Number(m.position_no ?? 0),
      teeTime: null,
      roundNo: activeRoundNo,
      matchId: String(m.id),
      topLabel: teamLabel(m.top_pair_id, teamById),
      bottomLabel: teamLabel(m.bottom_pair_id, teamById),
      resultText: m.result_text,
      status: m.status ?? "scheduled",
      liveText: liveByMatchId.get(m.id) ?? null,
    });
  }

  groups.sort((a, b) => a.groupNo - b.groupNo || a.groupId.localeCompare(b.groupId));

  return {
    ok: true,
    tournamentName,
    activeRoundNo,
    fromRoundNo,
    groups,
    message:
      groups.length > 0
        ? `${groups.length} grupo(s) de consolación Match Play (R${activeRoundNo}).`
        : `Sin grupos en R${activeRoundNo}. Genera consolación desde backoffice cuando cierren los partidos de R${fromRoundNo}.`,
  };
}
