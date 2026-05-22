import { createAdminClient } from "@/utils/supabase/admin";
import type { StrokeIndexByHole } from "@/lib/leaderboard/handicapStrokes";
import { loadMatchPlayTeamsData } from "./loadMatchPlayTeamsData";
import { effectiveEntryHi } from "./entryHi";
import { resolveMatchHandicapPct } from "./scoring/resolveHandicapPct";
import type {
  LowHighPlayerGross,
  LowHighHoleBreakdown,
} from "./scoring/lowHigh";
import type {
  MatchPlayHandicapAllowance,
  MatchPlayPairFormat,
} from "./types";

export type MatchHoleScoreRow = {
  hole_no: number;
  top_player_a_strokes: number | null;
  top_player_b_strokes: number | null;
  bottom_player_a_strokes: number | null;
  bottom_player_b_strokes: number | null;
  top_points: number | null;
  bottom_points: number | null;
  match_status_after: string | null;
  detail_json: { breakdown?: LowHighHoleBreakdown } | null;
};

export type MatchForScoring = {
  id: string;
  tournament_id: string;
  bracket_id: string;
  round_no: number;
  position_no: number;
  status: string;
  result_text: string | null;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  top_label: string;
  bottom_label: string;
  top_players: [{ label: string; hi: number }, { label: string; hi: number }];
  bottom_players: [{ label: string; hi: number }, { label: string; hi: number }];
  pair_format: MatchPlayPairFormat;
  allowance_pct: number;
  holes_in_match: number;
  stroke_index_by_hole: StrokeIndexByHole;
  holes: MatchHoleScoreRow[];
};

function buildStrokeIndex(
  rows: Array<{ hole_number: number; stroke_index: number | null }>
): StrokeIndexByHole {
  const map: StrokeIndexByHole = new Map();
  for (const row of rows) {
    if (row.stroke_index != null && Number.isFinite(Number(row.stroke_index))) {
      map.set(row.hole_number, Number(row.stroke_index));
    }
  }
  return map;
}

export async function loadMatchForScoring(
  matchId: string
): Promise<MatchForScoring | null> {
  const supabase = createAdminClient();

  const { data: match, error } = await supabase
    .from("matchplay_matches")
    .select(
      "id, tournament_id, bracket_id, round_no, position_no, status, result_text, top_pair_id, bottom_pair_id, winner_pair_id"
    )
    .eq("id", matchId)
    .maybeSingle();

  if (error || !match) return null;

  const { data: rules } = await supabase
    .from("tournament_matchplay_rules")
    .select(
      "pair_format, handicap_allowance, handicap_allowance_pct, holes_per_match, match_type"
    )
    .eq("tournament_id", match.tournament_id)
    .maybeSingle();

  const pair_format = (rules?.pair_format ?? "fourball") as MatchPlayPairFormat;
  if (pair_format !== "low_high") return null;

  const teamsData = await loadMatchPlayTeamsData(match.tournament_id);
  const teamById = new Map(teamsData.teams.map((t) => [t.id, t]));

  const top = match.top_pair_id ? teamById.get(match.top_pair_id) : null;
  const bottom = match.bottom_pair_id ? teamById.get(match.bottom_pair_id) : null;

  const topPlayers: MatchForScoring["top_players"] = [
    {
      label: top?.player_a
        ? `${top.player_a.player.first_name ?? ""} ${top.player_a.player.last_name ?? ""}`.trim()
        : "Jugador A",
      hi: top?.player_a ? effectiveEntryHi(top.player_a) : 0,
    },
    {
      label: top?.player_b
        ? `${top.player_b.player.first_name ?? ""} ${top.player_b.player.last_name ?? ""}`.trim()
        : "Jugador B",
      hi: top?.player_b ? effectiveEntryHi(top.player_b) : 0,
    },
  ];

  const bottomPlayers: MatchForScoring["bottom_players"] = [
    {
      label: bottom?.player_a
        ? `${bottom.player_a.player.first_name ?? ""} ${bottom.player_a.player.last_name ?? ""}`.trim()
        : "Jugador A",
      hi: bottom?.player_a ? effectiveEntryHi(bottom.player_a) : 0,
    },
    {
      label: bottom?.player_b
        ? `${bottom.player_b.player.first_name ?? ""} ${bottom.player_b.player.last_name ?? ""}`.trim()
        : "Jugador B",
      hi: bottom?.player_b ? effectiveEntryHi(bottom.player_b) : 0,
    },
  ];

  const { data: tholes } = await supabase
    .from("tournament_holes")
    .select("hole_number, stroke_index")
    .eq("tournament_id", match.tournament_id)
    .order("hole_number", { ascending: true });

  const { data: holeRows } = await supabase
    .from("matchplay_hole_results")
    .select(
      "hole_no, top_player_a_strokes, top_player_b_strokes, bottom_player_a_strokes, bottom_player_b_strokes, top_points, bottom_points, match_status_after, detail_json"
    )
    .eq("match_id", matchId)
    .order("hole_no", { ascending: true });

  const holesInMatch =
    rules?.holes_per_match === 9 ? 9 : 18;

  const allowance_pct = resolveMatchHandicapPct({
    match_type: rules?.match_type === "individual" ? "individual" : "pairs",
    pair_format,
    handicap_allowance: (rules?.handicap_allowance ??
      "custom") as MatchPlayHandicapAllowance,
    handicap_allowance_custom_pct:
      rules?.handicap_allowance_pct != null
        ? Number(rules.handicap_allowance_pct)
        : null,
  });

  const existingByHole = new Map(
    (holeRows ?? []).map((h) => [h.hole_no, h])
  );

  const holes: MatchHoleScoreRow[] = Array.from(
    { length: holesInMatch },
    (_, i) => {
      const hole_no = i + 1;
      const ex = existingByHole.get(hole_no);
      return {
        hole_no,
        top_player_a_strokes:
          ex?.top_player_a_strokes != null
            ? Number(ex.top_player_a_strokes)
            : null,
        top_player_b_strokes:
          ex?.top_player_b_strokes != null
            ? Number(ex.top_player_b_strokes)
            : null,
        bottom_player_a_strokes:
          ex?.bottom_player_a_strokes != null
            ? Number(ex.bottom_player_a_strokes)
            : null,
        bottom_player_b_strokes:
          ex?.bottom_player_b_strokes != null
            ? Number(ex.bottom_player_b_strokes)
            : null,
        top_points:
          ex?.top_points != null ? Number(ex.top_points) : null,
        bottom_points:
          ex?.bottom_points != null ? Number(ex.bottom_points) : null,
        match_status_after: ex?.match_status_after ?? null,
        detail_json: (ex?.detail_json ?? null) as MatchHoleScoreRow["detail_json"],
      };
    }
  );

  return {
    id: match.id,
    tournament_id: match.tournament_id,
    bracket_id: match.bracket_id,
    round_no: match.round_no,
    position_no: match.position_no,
    status: match.status,
    result_text: match.result_text,
    top_pair_id: match.top_pair_id,
    bottom_pair_id: match.bottom_pair_id,
    winner_pair_id: match.winner_pair_id,
    top_label: top?.team_name ?? "Arriba",
    bottom_label: bottom?.team_name ?? "Abajo",
    top_players: topPlayers,
    bottom_players: bottomPlayers,
    pair_format,
    allowance_pct,
    holes_in_match: holesInMatch,
    stroke_index_by_hole: buildStrokeIndex(
      (tholes ?? []).map((h) => ({
        hole_number: h.hole_number,
        stroke_index: h.stroke_index,
      }))
    ),
    holes,
  };
}

export function holeGrossFromRow(row: MatchHoleScoreRow): LowHighPlayerGross {
  return {
    top_a: row.top_player_a_strokes,
    top_b: row.top_player_b_strokes,
    bottom_a: row.bottom_player_a_strokes,
    bottom_b: row.bottom_player_b_strokes,
  };
}
