import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreLowHighHole,
  type LowHighPlayerGross,
} from "./scoring/lowHigh";
import { effectiveEntryHi, formatPlayerName } from "./entryHi";
import type { StrokeIndexByHole } from "@/lib/leaderboard/handicapStrokes";
import { resolveMatchHandicapPct } from "./scoring/resolveHandicapPct";
import type {
  MatchPlayHandicapAllowance,
  MatchPlayMatchType,
  MatchPlayPairFormat,
} from "./types";
import { derivePairingGroupMatches } from "./derivePairingGroupMatches";
import { loadMatchPlayTeamsData } from "./loadMatchPlayTeamsData";

export type PublicMatchDetailHole = {
  hole_no: number;
  has_score: boolean;
  top_points: number | null;
  bottom_points: number | null;
  top_cum: number | null;
  bottom_cum: number | null;
  match_status_after: string | null;
  top_player_a_strokes: number | null;
  top_player_b_strokes: number | null;
  bottom_player_a_strokes: number | null;
  bottom_player_b_strokes: number | null;
  breakdown: {
    top: { low: number; high: number; low_pts: number; high_pts: number };
    bottom: { low: number; high: number; low_pts: number; high_pts: number };
    nets: { top_a: number; top_b: number; bottom_a: number; bottom_b: number };
  } | null;
  stroke_index: number | null;
};

export type PublicMatchDetailPayload = {
  id: string;
  round_no: number;
  position_no: number;
  status: string;
  result_text: string | null;
  top_label: string;
  bottom_label: string;
  top_players: [{ label: string; hi: number; ph: number | null }, { label: string; hi: number; ph: number | null }];
  bottom_players: [{ label: string; hi: number; ph: number | null }, { label: string; hi: number; ph: number | null }];
  pair_format: string;
  allowance_pct: number;
  holes_in_match: number;
  last_hole_played: number;
  top_total: number;
  bottom_total: number;
  holes: PublicMatchDetailHole[];
  derived_from_strokes: true;
};

export function isDerivedMatchId(matchId: string): boolean {
  return matchId.startsWith("derived-");
}

function playerInfo(
  entryId: string | null,
  entryById: Map<
    string,
    {
      label: string;
      hi: number;
      ph: number | null;
      player_id: string;
    }
  >
): { label: string; hi: number; ph: number | null } {
  if (!entryId) return { label: "—", hi: 0, ph: null };
  const e = entryById.get(entryId);
  return e ?? { label: "—", hi: 0, ph: null };
}

/**
 * Detalle completo de un match derivado (salidas + hole_scores stroke play).
 */
export async function loadDerivedMatchDetail(
  admin: SupabaseClient,
  tournamentId: string,
  derivedMatchId: string
): Promise<PublicMatchDetailPayload | null> {
  if (!isDerivedMatchId(derivedMatchId)) return null;

  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const match = derived.matches.find((m) => m.id === derivedMatchId);
  if (
    !match ||
    !match.top_a_entry_id ||
    !match.top_b_entry_id ||
    !match.bottom_a_entry_id ||
    !match.bottom_b_entry_id
  ) {
    return null;
  }

  const teamsData = await loadMatchPlayTeamsData(tournamentId);
  const teamById = new Map(teamsData.teams.map((t) => [t.id, t]));
  const topTeam = match.top_pair_id ? teamById.get(match.top_pair_id) : null;
  const bottomTeam = match.bottom_pair_id ? teamById.get(match.bottom_pair_id) : null;

  const top_label =
    topTeam?.team_name ??
    (topTeam?.player_a
      ? formatPlayerName(topTeam.player_a.player)
      : "Equipo 1");
  const bottom_label =
    bottomTeam?.team_name ??
    (bottomTeam?.player_a
      ? formatPlayerName(bottomTeam.player_a.player)
      : "Equipo 2");

  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select(
      "pair_format, holes_per_match, handicap_allowance, handicap_allowance_pct, match_type"
    )
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const pair_format = (rules?.pair_format ?? "low_high") as MatchPlayPairFormat;
  if (pair_format !== "low_high") return null;

  const allowance_pct = resolveMatchHandicapPct({
    match_type: (rules?.match_type ?? "pairs") as MatchPlayMatchType,
    pair_format,
    handicap_allowance: (rules?.handicap_allowance ??
      "custom") as MatchPlayHandicapAllowance,
    handicap_allowance_custom_pct:
      rules?.handicap_allowance_pct != null
        ? Number(rules.handicap_allowance_pct)
        : null,
  });

  const holes_in_match = rules?.holes_per_match === 9 ? 9 : 18;

  const { data: tholes } = await admin
    .from("tournament_holes")
    .select("hole_number, handicap_index")
    .eq("tournament_id", tournamentId)
    .order("hole_number", { ascending: true });

  const strokeIndexByHole: StrokeIndexByHole = new Map();
  for (const row of (tholes ?? []) as Array<{
    hole_number: number;
    handicap_index: number | null;
  }>) {
    if (row.handicap_index != null && Number.isFinite(Number(row.handicap_index))) {
      strokeIndexByHole.set(row.hole_number, Number(row.handicap_index));
    }
  }

  const entryIds = [
    match.top_a_entry_id,
    match.top_b_entry_id,
    match.bottom_a_entry_id,
    match.bottom_b_entry_id,
  ];

  const { data: entriesRaw } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, handicap_index, playing_handicap, course_handicap, playing_handicap_override, players:players(first_name, last_name, handicap_index, handicap_torneo)"
    )
    .in("id", entryIds);

  type EntryRow = {
    id: string;
    player_id: string;
    handicap_index: number | null;
    playing_handicap: number | null;
    course_handicap: number | null;
    playing_handicap_override: number | null;
    players:
      | {
          first_name: string | null;
          last_name: string | null;
          handicap_index: number | null;
          handicap_torneo: number | null;
        }
      | Array<{
          first_name: string | null;
          last_name: string | null;
          handicap_index: number | null;
          handicap_torneo: number | null;
        }>
      | null;
  };

  const entryById = new Map<
    string,
    { label: string; hi: number; ph: number | null; player_id: string }
  >();

  for (const e of (entriesRaw ?? []) as EntryRow[]) {
    const p = Array.isArray(e.players) ? e.players[0] : e.players;
    const phEffective =
      e.playing_handicap_override != null
        ? Number(e.playing_handicap_override)
        : e.playing_handicap != null
          ? Number(e.playing_handicap)
          : null;
    entryById.set(e.id, {
      player_id: e.player_id,
      label: formatPlayerName({
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
      }),
      hi: effectiveEntryHi({
        handicap_index: e.handicap_index,
        player: {
          handicap_index: p?.handicap_index ?? null,
          handicap_torneo: p?.handicap_torneo ?? null,
        },
      }),
      ph: phEffective,
    });
  }

  const eTopA = entryById.get(match.top_a_entry_id)!;
  const eTopB = entryById.get(match.top_b_entry_id)!;
  const eBotA = entryById.get(match.bottom_a_entry_id)!;
  const eBotB = entryById.get(match.bottom_b_entry_id)!;

  const hi: [number, number, number, number] = [
    eTopA.hi,
    eTopB.hi,
    eBotA.hi,
    eBotB.hi,
  ];
  const phs: [number | null, number | null, number | null, number | null] = [
    eTopA.ph,
    eTopB.ph,
    eBotA.ph,
    eBotB.ph,
  ];

  const playerIds = [eTopA.player_id, eTopB.player_id, eBotA.player_id, eBotB.player_id];
  const { data: roundScoresRaw } = await admin
    .from("round_scores")
    .select("id, player_id, round_id")
    .in("player_id", playerIds)
    .eq("round_id", match.round_id);

  const rsByPlayer = new Map<string, string>();
  for (const rs of (roundScoresRaw ?? []) as Array<{
    id: string;
    player_id: string;
  }>) {
    rsByPlayer.set(rs.player_id, rs.id);
  }

  const roundScoreIds = Array.from(rsByPlayer.values());
  const grossByRsHole = new Map<string, Map<number, number>>();

  if (roundScoreIds.length > 0) {
    const { data: hsRaw } = await admin
      .from("hole_scores")
      .select("round_score_id, hole_number, hole_no, strokes, score")
      .in("round_score_id", roundScoreIds);

    for (const hs of (hsRaw ?? []) as Array<{
      round_score_id: string;
      hole_number: number | null;
      hole_no: number | null;
      strokes: number | null;
      score: number | null;
    }>) {
      const holeNo = hs.hole_number ?? hs.hole_no;
      if (holeNo == null) continue;
      const g = hs.strokes ?? hs.score;
      if (g == null) continue;
      const m = grossByRsHole.get(hs.round_score_id) ?? new Map();
      m.set(Number(holeNo), Number(g));
      grossByRsHole.set(hs.round_score_id, m);
    }
  }

  function grossFor(entryId: string, holeNo: number): number | null {
    const e = entryById.get(entryId);
    if (!e) return null;
    const rsId = rsByPlayer.get(e.player_id);
    if (!rsId) return null;
    return grossByRsHole.get(rsId)?.get(holeNo) ?? null;
  }

  let topAcc = 0;
  let bottomAcc = 0;
  const holes: PublicMatchDetailHole[] = [];

  for (let h = 1; h <= holes_in_match; h++) {
    const top_a = grossFor(match.top_a_entry_id, h);
    const top_b = grossFor(match.top_b_entry_id, h);
    const bottom_a = grossFor(match.bottom_a_entry_id, h);
    const bottom_b = grossFor(match.bottom_b_entry_id, h);

    const hasAll =
      top_a != null && top_b != null && bottom_a != null && bottom_b != null;

    if (!hasAll) {
      holes.push({
        hole_no: h,
        has_score: false,
        top_points: null,
        bottom_points: null,
        top_cum: null,
        bottom_cum: null,
        match_status_after: null,
        top_player_a_strokes: top_a,
        top_player_b_strokes: top_b,
        bottom_player_a_strokes: bottom_a,
        bottom_player_b_strokes: bottom_b,
        breakdown: null,
        stroke_index: strokeIndexByHole.get(h) ?? null,
      });
      continue;
    }

    const res = scoreLowHighHole({
      hole_no: h,
      gross: { top_a, top_b, bottom_a, bottom_b } as LowHighPlayerGross,
      hi,
      allowance_pct,
      playing_handicaps: phs,
      strokeIndexByHole,
      top_total_before: topAcc,
      bottom_total_before: bottomAcc,
      holes_in_match,
    });

    if (!res) {
      holes.push({
        hole_no: h,
        has_score: false,
        top_points: null,
        bottom_points: null,
        top_cum: null,
        bottom_cum: null,
        match_status_after: null,
        top_player_a_strokes: top_a,
        top_player_b_strokes: top_b,
        bottom_player_a_strokes: bottom_a,
        bottom_player_b_strokes: bottom_b,
        breakdown: null,
        stroke_index: strokeIndexByHole.get(h) ?? null,
      });
      continue;
    }

    topAcc += res.top_points;
    bottomAcc += res.bottom_points;

    holes.push({
      hole_no: h,
      has_score: true,
      top_points: res.top_points,
      bottom_points: res.bottom_points,
      top_cum: topAcc,
      bottom_cum: bottomAcc,
      match_status_after: res.match_status_after,
      top_player_a_strokes: top_a,
      top_player_b_strokes: top_b,
      bottom_player_a_strokes: bottom_a,
      bottom_player_b_strokes: bottom_b,
      breakdown: res.breakdown,
      stroke_index: strokeIndexByHole.get(h) ?? null,
    });
  }

  const last_hole_played = holes
    .filter((h) => h.has_score)
    .reduce((max, h) => Math.max(max, h.hole_no), 0);

  const top_players = [
    playerInfo(match.top_a_entry_id, entryById),
    playerInfo(match.top_b_entry_id, entryById),
  ] as PublicMatchDetailPayload["top_players"];

  const bottom_players = [
    playerInfo(match.bottom_a_entry_id, entryById),
    playerInfo(match.bottom_b_entry_id, entryById),
  ] as PublicMatchDetailPayload["bottom_players"];

  let result_text: string | null = null;
  if (last_hole_played >= holes_in_match) {
    if (topAcc > bottomAcc) result_text = `${top_label} gana`;
    else if (bottomAcc > topAcc) result_text = `${bottom_label} gana`;
    else if (topAcc === bottomAcc && topAcc > 0) result_text = "Empate";
  }

  return {
    id: match.id,
    round_no: match.round_no,
    position_no: match.position_no,
    status: last_hole_played > 0 ? "in_progress" : "scheduled",
    result_text,
    top_label,
    bottom_label,
    top_players,
    bottom_players,
    pair_format,
    allowance_pct,
    holes_in_match,
    last_hole_played,
    top_total: topAcc,
    bottom_total: bottomAcc,
    holes,
    derived_from_strokes: true,
  };
}
