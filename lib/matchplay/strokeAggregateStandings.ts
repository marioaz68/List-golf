import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import type { TieBreakStep } from "@/lib/cuts/tieBreak";
import { segmentStrokeTotal } from "@/lib/cuts/tieBreak";
import {
  scoreRoundDetail,
  type StrokeIndexByHole,
} from "@/lib/leaderboard/competitionScoring";
import {
  normalizeCompetitionRule,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import { effectivePlayingHandicapForScoring } from "@/lib/leaderboard/handicapStrokes";
import { loadCourseLayoutForTournament } from "@/lib/matchplay/loadCourseLayout";
import {
  collectLoserPairIdsForStrokeAggregate,
  STROKE_AGG_NOTES_PREFIX,
} from "@/lib/matchplay/consolationStrokePlay";
import { CONSOLATION_BRACKET_NAME } from "@/lib/matchplay/consolationMatchPlay";
import {
  DEFAULT_STROKE_AGGREGATE_TIEBREAKERS,
  type MatchPlayConvocatoriaConfig,
  type StrokeAggregateTiebreaker,
} from "@/lib/matchplay/types";

export type StrokeAggregatePlayerRow = {
  entryId: string;
  playerId: string | null;
  gender: string;
  name: string;
  gross: number | null;
  net: number | null;
  netToPar: number | null;
  holesPlayed: number;
  playingHandicap: number;
  handicapIndex: number | null;
  /** Tarjeta cerrada (scorecards.locked_at). */
  lockedAt: string | null;
};

export type StrokeAggregateGroup = {
  groupId: string;
  groupNo: number;
  /** Etiqueta de género (Hombres / Mujeres / Mixto). */
  label: string;
  teeTime: string | null;
  members: StrokeAggregatePlayerRow[];
  /** True cuando todos los integrantes tienen tarjeta cerrada. */
  cardsClosed: boolean;
};

export type StrokeAggregatePairRow = {
  pairId: string;
  label: string;
  seed: number | null;
  combinedHi: number | null;
  playerA: StrokeAggregatePlayerRow;
  playerB: StrokeAggregatePlayerRow;
  /** Suma neto de ambos jugadores (18 hoyos). */
  aggregateNet: number | null;
  aggregateNetToPar: number | null;
  aggregateGross: number | null;
  holesPlayed: number;
  position: number;
  tied: boolean;
  detailA: RoundDetail | null;
  detailB: RoundDetail | null;
};

export type StrokeAggregateStandings = {
  ok: boolean;
  roundNo: number | null;
  roundId: string | null;
  allowancePct: number;
  pairs: StrokeAggregatePairRow[];
  /** Salidas (foursomes) de la consolación con score en vivo por jugador. */
  groups: StrokeAggregateGroup[];
  message: string;
};

function formatName(first: string | null, last: string | null): string {
  return `${(first ?? "").trim()} ${(last ?? "").trim()}`.trim() || "—";
}

function buildRoundDetail(
  roundId: string,
  roundNo: number,
  entryId: string,
  playerId: string,
  holes: Array<{ hole_number: number; par: number | null; strokes: number | null }>,
  grossScore: number | null
): RoundDetail {
  return {
    round_id: roundId,
    round_no: roundNo,
    round_date: null,
    gross_score: grossScore,
    to_par: null,
    out_score: null,
    in_score: null,
    total_score: grossScore,
    holes,
    is_dq: false,
  };
}

function compareSegment(
  a: number | null,
  b: number | null,
  lowerIsBetter: boolean
): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (a === b) return 0;
  return lowerIsBetter ? a - b : b - a;
}

function pairSegmentTotal(
  detailA: RoundDetail | null,
  detailB: RoundDetail | null,
  holeScope: string,
  opts: {
    catRule: CategoryCompetitionRule;
    strokeIndexByHole: StrokeIndexByHole;
    hiA: number | null;
    hiB: number | null;
  }
): number | null {
  const segOpts = {
    basis: "net",
    handicapMode: "course",
    catRule: opts.catRule,
    strokeIndexByHole: opts.strokeIndexByHole,
  };
  const sa = detailA
    ? segmentStrokeTotal(detailA, holeScope, {
        ...segOpts,
        handicapIndex: opts.hiA,
      })
    : null;
  const sb = detailB
    ? segmentStrokeTotal(detailB, holeScope, {
        ...segOpts,
        handicapIndex: opts.hiB,
      })
    : null;
  if (sa == null && sb == null) return null;
  return (sa ?? 0) + (sb ?? 0);
}

function comparePairsByTieBreak(
  a: StrokeAggregatePairRow,
  b: StrokeAggregatePairRow,
  steps: TieBreakStep[],
  ctx: {
    catRule: CategoryCompetitionRule;
    strokeIndexByHole: StrokeIndexByHole;
  }
): number {
  const ordered = [...steps].sort((x, y) => x.step_no - y.step_no);

  for (const step of ordered) {
    if (step.method === "segment_compare") {
      const lower = step.direction === "lower_is_better";
      const ta = pairSegmentTotal(a.detailA, a.detailB, step.hole_scope, {
        catRule: ctx.catRule,
        strokeIndexByHole: ctx.strokeIndexByHole,
        hiA: a.playerA.handicapIndex,
        hiB: a.playerB.handicapIndex,
      });
      const tb = pairSegmentTotal(b.detailA, b.detailB, step.hole_scope, {
        catRule: ctx.catRule,
        strokeIndexByHole: ctx.strokeIndexByHole,
        hiA: b.playerA.handicapIndex,
        hiB: b.playerB.handicapIndex,
      });
      const cmp = compareSegment(ta, tb, lower);
      if (cmp !== 0) return cmp;
      continue;
    }

    if (step.method === "lower_handicap_index") {
      const vt = String(step.value_text ?? "").toLowerCase();
      if (vt === "lowest_combined_hi") {
        const ca = a.combinedHi ?? Number.POSITIVE_INFINITY;
        const cb = b.combinedHi ?? Number.POSITIVE_INFINITY;
        if (ca !== cb) return ca - cb;
      } else {
        const minA = Math.min(
          a.playerA.playingHandicap,
          a.playerB.playingHandicap
        );
        const minB = Math.min(
          b.playerA.playingHandicap,
          b.playerB.playingHandicap
        );
        if (minA !== minB) return minA - minB;
      }
      continue;
    }

    if (step.method === "random_draw") {
      return a.pairId.localeCompare(b.pairId);
    }
  }

  return 0;
}

async function loadTieBreakSteps(
  admin: SupabaseClient,
  tournamentId: string,
  keys: StrokeAggregateTiebreaker[]
): Promise<TieBreakStep[]> {
  const { data: profile } = await admin
    .from("tie_break_profiles")
    .select("id")
    .eq("tournament_id", tournamentId)
    .ilike("name", "Consolación stroke ·%")
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (profile?.id) {
    const { data: steps } = await admin
      .from("tie_break_steps")
      .select(
        "tie_break_profile_id, step_no, method, basis, round_scope, hole_scope, handicap_mode, direction, value_text"
      )
      .eq("tie_break_profile_id", profile.id)
      .order("step_no", { ascending: true });
    if (steps && steps.length > 0) {
      return steps as TieBreakStep[];
    }
  }

  const HOLE_SCOPE: Partial<Record<StrokeAggregateTiebreaker, string>> = {
    h10_18: "10_18",
    h13_18: "13_18",
    h16_18: "16_18",
    h18: "18",
    h1_9: "1_9",
    h4_9: "4_9",
    h7_9: "7_9",
    h9: "9",
  };

  return keys.map((key, i) => {
    const holeScope = HOLE_SCOPE[key];
    if (holeScope) {
      return {
        step_no: i + 1,
        method: "segment_compare",
        basis: "net",
        round_scope: "last_round_played",
        hole_scope: holeScope,
        handicap_mode: "course_handicap_80_percent_proportional",
        direction: "lower_is_better",
        value_text: null,
      };
    }
    if (key === "lowest_hi") {
      return {
        step_no: i + 1,
        method: "lower_handicap_index",
        basis: "",
        round_scope: "",
        hole_scope: "",
        handicap_mode: "",
        direction: "",
        value_text: "lowest_combined_hi",
      };
    }
    if (key === "lower_hi_player") {
      return {
        step_no: i + 1,
        method: "lower_handicap_index",
        basis: "",
        round_scope: "",
        hole_scope: "",
        handicap_mode: "",
        direction: "",
        value_text: "lowest_player_hi",
      };
    }
    return {
      step_no: i + 1,
      method: "random_draw",
      basis: "",
      round_scope: "",
      hole_scope: "",
      handicap_mode: "",
      direction: "",
      value_text: "drawing_lots",
    };
  });
}

export async function loadStrokeAggregateStandings(
  admin: SupabaseClient,
  tournamentId: string
): Promise<StrokeAggregateStandings> {
  const empty = (msg: string): StrokeAggregateStandings => ({
    ok: false,
    roundNo: null,
    roundId: null,
    allowancePct: 80,
    pairs: [],
    groups: [],
    message: msg,
  });

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("config_json, handicap_allowance_pct, handicap_allowance")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const cfg = (rulesRow?.config_json ?? {}) as Partial<MatchPlayConvocatoriaConfig>;
  const strokeRule = (Array.isArray(cfg.consolations) ? cfg.consolations : []).find(
    (r) => r.enabled && r.consolation_format === "stroke_play_aggregate"
  );
  if (!strokeRule) {
    return empty("Este torneo no tiene consolación Stroke Play Agregado.");
  }

  let allowancePct = 80;
  if (rulesRow?.handicap_allowance === "full") allowancePct = 100;
  else if (rulesRow?.handicap_allowance === "ninety_five") allowancePct = 95;
  else if (
    rulesRow?.handicap_allowance === "custom" &&
    rulesRow.handicap_allowance_pct != null
  ) {
    allowancePct = Number(rulesRow.handicap_allowance_pct);
  } else if (cfg.handicap_allowance_custom_pct != null) {
    allowancePct = Number(cfg.handicap_allowance_custom_pct);
  }

  const { data: mainBracket } = await admin
    .from("matchplay_brackets")
    .select("config_json")
    .eq("tournament_id", tournamentId)
    .neq("name", CONSOLATION_BRACKET_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let bracketSize =
    (mainBracket?.config_json as { bracket_size?: number } | null)?.bracket_size ??
    cfg.bracket_main_pairs ??
    32;
  if (bracketSize < 2) bracketSize = 32;
  const lastRoundNo = Math.max(1, Math.round(Math.log2(bracketSize)));

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id")
    .eq("tournament_id", tournamentId)
    .eq("round_no", lastRoundNo)
    .maybeSingle();
  if (!roundRow?.id) {
    return empty(`No existe la ronda ${lastRoundNo} en el calendario.`);
  }
  const roundId = String(roundRow.id);

  const loserPairIds = await collectLoserPairIdsForStrokeAggregate(
    admin,
    tournamentId
  );
  if (loserPairIds.size === 0) {
    return {
      ok: true,
      roundNo: lastRoundNo,
      roundId,
      allowancePct,
      pairs: [],
      groups: [],
      message: "Aún no hay parejas perdedoras registradas.",
    };
  }

  const { data: pairTeams } = await admin
    .from("matchplay_pair_teams")
    .select(
      "id, player_a_entry_id, player_b_entry_id, combined_hi, seed, team_name"
    )
    .in("id", Array.from(loserPairIds));

  const entryIds = new Set<string>();
  for (const t of pairTeams ?? []) {
    if (t.player_a_entry_id) entryIds.add(String(t.player_a_entry_id));
    if (t.player_b_entry_id) entryIds.add(String(t.player_b_entry_id));
  }

  // Salidas (foursomes) STROKE AGREGADO de la ronda destino + sus integrantes.
  const { data: strokeGroupRows } = await admin
    .from("pairing_groups")
    .select("id, group_no, tee_time, notes")
    .eq("round_id", roundId)
    .ilike("notes", `${STROKE_AGG_NOTES_PREFIX}%`)
    .order("group_no", { ascending: true });
  const strokeGroupIds = (strokeGroupRows ?? []).map((g) => String(g.id));
  const groupMembersByGroup = new Map<
    string,
    Array<{ entryId: string; position: number }>
  >();
  if (strokeGroupIds.length > 0) {
    const { data: memberRows } = await admin
      .from("pairing_group_members")
      .select("group_id, entry_id, position")
      .in("group_id", strokeGroupIds);
    for (const m of memberRows ?? []) {
      const gid = String(m.group_id);
      const list = groupMembersByGroup.get(gid) ?? [];
      list.push({ entryId: String(m.entry_id), position: Number(m.position) || 0 });
      groupMembersByGroup.set(gid, list);
      if (m.entry_id) entryIds.add(String(m.entry_id));
    }
  }

  const { data: entries } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, handicap_index, course_handicap, playing_handicap, playing_handicap_override, players(first_name, last_name, gender)"
    )
    .in("id", Array.from(entryIds));

  const { data: roundScores } = await admin
    .from("round_scores")
    .select("id, entry_id, player_id, gross_score")
    .eq("round_id", roundId);

  const lockedAtByEntry = new Map<string, string>();
  if (entryIds.size > 0) {
    const { data: lockedRows } = await admin
      .from("scorecards")
      .select("entry_id, locked_at")
      .eq("round_id", roundId)
      .in("entry_id", Array.from(entryIds))
      .not("locked_at", "is", null);
    for (const row of lockedRows ?? []) {
      if (row.entry_id && row.locked_at) {
        lockedAtByEntry.set(String(row.entry_id), String(row.locked_at));
      }
    }
  }

  const rsByEntry = new Map<string, { id: string; gross_score: number | null }>();
  for (const rs of roundScores ?? []) {
    if (rs.entry_id) {
      rsByEntry.set(String(rs.entry_id), {
        id: String(rs.id),
        gross_score: rs.gross_score,
      });
    }
  }

  const rsIds = (roundScores ?? []).map((r) => String(r.id));
  const holesByRs = new Map<
    string,
    Array<{ hole_number: number; par: number | null; strokes: number | null }>
  >();
  if (rsIds.length > 0) {
    const { data: holeRows } = await admin
      .from("hole_scores")
      .select("round_score_id, hole_no, hole_number, strokes")
      .in("round_score_id", rsIds);
    for (const h of holeRows ?? []) {
      const rsId = String(h.round_score_id);
      const holeNo =
        typeof h.hole_number === "number"
          ? h.hole_number
          : typeof h.hole_no === "number"
            ? h.hole_no
            : 0;
      if (holeNo < 1 || holeNo > 18) continue;
      const list = holesByRs.get(rsId) ?? [];
      list.push({
        hole_number: holeNo,
        par: null,
        strokes: h.strokes != null ? Number(h.strokes) : null,
      });
      holesByRs.set(rsId, list);
    }
  }

  const { strokeIndexByHole, parByHole } = await loadCourseLayoutForTournament(
    admin,
    tournamentId
  );
  const catRule = normalizeCompetitionRule({
    category_id: "stroke-aggregate",
    scoring_format: "stroke_play",
    leaderboard_basis: "net",
    handicap_percentage: allowancePct,
    is_active: true,
  });

  const tieKeys =
    strokeRule.stroke_aggregate_tiebreakers?.length
      ? strokeRule.stroke_aggregate_tiebreakers
      : [...DEFAULT_STROKE_AGGREGATE_TIEBREAKERS];
  const tieSteps = await loadTieBreakSteps(admin, tournamentId, tieKeys);

  const scoreCache = new Map<
    string,
    { row: StrokeAggregatePlayerRow; detail: RoundDetail | null }
  >();

  function scorePlayer(entryId: string): {
    row: StrokeAggregatePlayerRow;
    detail: RoundDetail | null;
  } {
    const cached = scoreCache.get(entryId);
    if (cached) return cached;

    const entry = (entries ?? []).find((e) => String(e.id) === entryId);
    const p = entry?.players as
      | { first_name: string | null; last_name: string | null; gender?: string | null }
      | { first_name: string | null; last_name: string | null; gender?: string | null }[]
      | null;
    const player = Array.isArray(p) ? p[0] : p;
    const playerId = entry?.player_id ? String(entry.player_id) : null;
    const gender = String(player?.gender ?? "X").toUpperCase();
    const lockedAt = lockedAtByEntry.get(entryId) ?? null;
    const hi = entry?.handicap_index != null ? Number(entry.handicap_index) : null;
    const ph = effectivePlayingHandicapForScoring(
      entry?.playing_handicap_override ?? entry?.playing_handicap,
      hi,
      allowancePct
    );

    const rs = rsByEntry.get(entryId);
    if (!rs) {
      const result = {
        row: {
          entryId,
          playerId,
          gender,
          name: formatName(player?.first_name ?? null, player?.last_name ?? null),
          gross: null,
          net: null,
          netToPar: null,
          holesPlayed: 0,
          playingHandicap: ph,
          handicapIndex: hi,
          lockedAt,
        },
        detail: null,
      };
      scoreCache.set(entryId, result);
      return result;
    }

    const rawHoles = (holesByRs.get(rs.id) ?? []).map((h) => ({
      hole_number: h.hole_number,
      par: parByHole.get(h.hole_number) ?? null,
      strokes: h.strokes,
    }));
    const detail = buildRoundDetail(
      roundId,
      lastRoundNo,
      entryId,
      String(entry?.player_id ?? ""),
      rawHoles,
      rs.gross_score
    );
    const scored = scoreRoundDetail(detail, catRule, ph, strokeIndexByHole, hi);
    const holesPlayed = rawHoles.filter((h) => h.strokes != null).length;

    const result = {
      row: {
        entryId,
        playerId,
        gender,
        name: formatName(player?.first_name ?? null, player?.last_name ?? null),
        gross: scored.gross,
        net: scored.netStrokes,
        netToPar: scored.netToPar,
        holesPlayed,
        playingHandicap: ph,
        handicapIndex: hi,
        lockedAt,
      },
      detail,
    };
    scoreCache.set(entryId, result);
    return result;
  }

  const pairRows: StrokeAggregatePairRow[] = [];

  for (const t of pairTeams ?? []) {
    const eA = t.player_a_entry_id ? String(t.player_a_entry_id) : null;
    const eB = t.player_b_entry_id ? String(t.player_b_entry_id) : null;
    if (!eA || !eB) continue;

    const scoredA = scorePlayer(eA);
    const scoredB = scorePlayer(eB);

    const aggregateNet =
      scoredA.row.net != null && scoredB.row.net != null
        ? scoredA.row.net + scoredB.row.net
        : scoredA.row.net ?? scoredB.row.net;
    const aggregateNetToPar =
      scoredA.row.netToPar != null && scoredB.row.netToPar != null
        ? scoredA.row.netToPar + scoredB.row.netToPar
        : null;
    const aggregateGross =
      scoredA.row.gross != null && scoredB.row.gross != null
        ? scoredA.row.gross + scoredB.row.gross
        : null;
    const holesPlayed = Math.max(
      scoredA.row.holesPlayed,
      scoredB.row.holesPlayed
    );

    const seed = t.seed != null ? Number(t.seed) : null;
    const label =
      (t.team_name as string | null)?.trim() ||
      (seed != null ? `#${seed}` : `Pareja ${String(t.id).slice(0, 6)}`);

    pairRows.push({
      pairId: String(t.id),
      label,
      seed,
      combinedHi: t.combined_hi != null ? Number(t.combined_hi) : null,
      playerA: scoredA.row,
      playerB: scoredB.row,
      aggregateNet,
      aggregateNetToPar,
      aggregateGross,
      holesPlayed,
      position: 0,
      tied: false,
      detailA: scoredA.detail,
      detailB: scoredB.detail,
    });
  }

  // Ordenar: primero por total neto agregado (menor mejor), luego desempates.
  pairRows.sort((a, b) => {
    const na = a.aggregateNet ?? Number.POSITIVE_INFINITY;
    const nb = b.aggregateNet ?? Number.POSITIVE_INFINITY;
    if (na !== nb) return na - nb;
    return comparePairsByTieBreak(a, b, tieSteps, {
      catRule,
      strokeIndexByHole,
    });
  });

  let pos = 0;
  for (let i = 0; i < pairRows.length; i++) {
    if (
      i === 0 ||
      pairRows[i].aggregateNet !== pairRows[i - 1].aggregateNet
    ) {
      pos = i + 1;
    }
    pairRows[i].position = pos;
    pairRows[i].tied =
      i > 0 && pairRows[i].aggregateNet === pairRows[i - 1].aggregateNet;
  }

  // Salidas (foursomes) con score en vivo por jugador.
  const groups: StrokeAggregateGroup[] = [];
  for (const g of strokeGroupRows ?? []) {
    const gid = String(g.id);
    const rawLabel = String(g.notes ?? "").slice(STROKE_AGG_NOTES_PREFIX.length).trim();
    const memberRows = (groupMembersByGroup.get(gid) ?? []).sort(
      (a, b) => a.position - b.position
    );
    const members = memberRows.map((m) => scorePlayer(m.entryId).row);
    const cardsClosed =
      members.length > 0 && members.every((m) => Boolean(m.lockedAt));
    groups.push({
      groupId: gid,
      groupNo: Number(g.group_no) || 0,
      label: rawLabel || "Stroke",
      teeTime: g.tee_time != null ? String(g.tee_time) : null,
      members,
      cardsClosed,
    });
  }

  return {
    ok: true,
    roundNo: lastRoundNo,
    roundId,
    allowancePct,
    pairs: pairRows,
    groups,
    message: `${pairRows.length} pareja(s) en clasificación stroke agregado (R${lastRoundNo}, neto ${allowancePct}% HI).`,
  };
}

/** Indica si ya hay salidas STROKE AGREGADO en la última ronda. */
export async function hasStrokeAggregateGroups(
  admin: SupabaseClient,
  tournamentId: string,
  roundId: string
): Promise<boolean> {
  const { count } = await admin
    .from("pairing_groups")
    .select("id", { count: "exact", head: true })
    .eq("round_id", roundId)
    .ilike("notes", `${STROKE_AGG_NOTES_PREFIX}%`);
  return (count ?? 0) > 0;
}
