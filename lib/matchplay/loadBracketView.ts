import { createAdminClient } from "@/utils/supabase/admin";
import { loadMatchPlayTeamsData } from "./loadMatchPlayTeamsData";
import { formatPlayerName } from "./entryHi";
import type { MatchPlayTeamRow } from "./teamTypes";

export type BracketMatchView = {
  id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string;
  result_text: string | null;
  top_label: string;
  bottom_label: string;
  winner_label: string | null;
};

export type BracketView = {
  id: string;
  name: string;
  status: string;
  bracket_type: string;
  category_id: string | null;
  config_json: Record<string, unknown>;
  matches: BracketMatchView[];
  roundCount: number;
};

function teamLabel(
  teamId: string | null,
  teamById: Map<string, MatchPlayTeamRow>
): string {
  if (!teamId) return "BYE";
  const t = teamById.get(teamId);
  if (!t) return "—";
  const seed = t.seed != null ? `#${t.seed} ` : "";
  return `${seed}${t.team_name ?? formatPlayerName(t.player_a?.player ?? {})}`;
}

export async function loadBracketView(
  tournamentId: string
): Promise<BracketView | null> {
  const supabase = createAdminClient();

  const { data: bracket } = await supabase
    .from("matchplay_brackets")
    .select("id, name, status, bracket_type, category_id, config_json")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!bracket) return null;

  const { data: matchesRaw } = await supabase
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
    )
    .eq("bracket_id", bracket.id)
    .order("round_no", { ascending: true })
    .order("position_no", { ascending: true });

  const teamsData = await loadMatchPlayTeamsData(tournamentId);
  const teamById = new Map<string, MatchPlayTeamRow>();
  for (const t of teamsData.teams) {
    teamById.set(t.id, t);
  }

  const matches: BracketMatchView[] = (matchesRaw ?? []).map((m) => ({
    id: m.id,
    round_no: m.round_no,
    position_no: m.position_no,
    top_pair_id: m.top_pair_id,
    bottom_pair_id: m.bottom_pair_id,
    winner_pair_id: m.winner_pair_id,
    status: m.status,
    result_text: m.result_text,
    top_label: teamLabel(m.top_pair_id, teamById),
    bottom_label: teamLabel(m.bottom_pair_id, teamById),
    winner_label: m.winner_pair_id
      ? teamLabel(m.winner_pair_id, teamById)
      : null,
  }));

  const roundCount = matches.reduce((max, m) => Math.max(max, m.round_no), 0);

  return {
    id: bracket.id,
    name: bracket.name,
    status: bracket.status,
    bracket_type: bracket.bracket_type,
    category_id: bracket.category_id,
    config_json: (bracket.config_json ?? {}) as Record<string, unknown>,
    matches,
    roundCount,
  };
}
