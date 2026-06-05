import type { SupabaseClient } from "@supabase/supabase-js";
import { roundCountForBracketSize } from "@/lib/matchplay/bracketUtils";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";
import { getConsolationBracketId } from "@/lib/matchplay/consolationMatchPlay";
import {
  deriveMatchHolesFromStrokes,
  type DerivedMatchHolesResult,
} from "@/lib/matchplay/deriveMatchHolesFromStrokes";
import type { DerivedMatchRow } from "@/lib/matchplay/derivePairingGroupMatches";

export type LiveMatchPlayMatchRow = {
  id: string;
  bracket_id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string | null;
  result_text: string | null;
};

export type LiveMatchPlayHoleRow = {
  match_id: string;
  hole_no: number;
  top_points: number | null;
  bottom_points: number | null;
  match_status_after: string | null;
};

export type LiveStrokeSnapshot = {
  matches: LiveMatchPlayMatchRow[];
  holes: LiveMatchPlayHoleRow[];
  bracketId: string | null;
  bracketSize: number;
  roundCount: number;
  /** True cuando los puntos vienen de hole_scores (captura rápida), no de matchplay_hole_results. */
  liveFromStrokeScores: boolean;
  derivedFromPairings: boolean;
};

function fmtN(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

function buildResultText(
  matchId: string,
  derivedResult: DerivedMatchHolesResult,
  holesPerMatch: number
): string | null {
  const dec = derivedResult.decisions.get(matchId);
  const summary = derivedResult.summaries.get(matchId);
  if (!summary) return null;

  if (dec?.via_playoff && dec.playoff_hole != null) {
    const lead = Math.abs(dec.top_total - dec.bottom_total);
    return `Desempate H${dec.playoff_hole} · ${fmtN(lead)} arriba`;
  }

  if (dec) {
    const lead = Math.abs(dec.top_total - dec.bottom_total);
    const holesRemaining = Math.max(0, holesPerMatch - dec.decided_at_hole);
    const pointsRemaining = holesRemaining * 2;
    const tail = pointsRemaining === 0 ? "" : ` · ${pointsRemaining} por jugar`;
    if (lead === 0) {
      return `H${dec.decided_at_hole} · AS${tail}`;
    }
    return `H${dec.decided_at_hole} · ${fmtN(lead)} arriba${tail}`;
  }

  if (summary.needs_playoff) {
    if (summary.playoff_pending_hole != null) {
      return `Desempate P${summary.playoff_pending_hole} · faltan scores`;
    }
    return `H18 · AS · desempate pendiente`;
  }

  const matchHoles = derivedResult.holes.filter((h) => h.match_id === matchId);
  const played = matchHoles.filter(
    (h) =>
      (h.top_points != null || h.bottom_points != null) && h.hole_no <= 18
  );
  if (played.length === 0) return null;
  const lastHole = played.reduce((max, h) => Math.max(max, h.hole_no), 0);
  const lead = Math.abs(summary.top_total - summary.bottom_total);
  const pointsRemaining = Math.max(0, 18 - lastHole) * 2;
  const tail = pointsRemaining === 0 ? "" : ` · ${pointsRemaining} por jugar`;
  if (lead === 0) return `H${lastHole} · AS${tail}`;
  return `H${lastHole} · ${fmtN(lead)} arriba${tail}`;
}

function applyDerivedToMatches(
  matches: LiveMatchPlayMatchRow[],
  derivedResult: DerivedMatchHolesResult,
  /** Mapa derived match_id → official match_id (identidad si no hay bracket). */
  derivedToOfficial: Map<string, string>,
  holesPerMatch: number
): LiveMatchPlayMatchRow[] {
  const officialToDerived = new Map<string, string>();
  for (const [derivedId, officialId] of derivedToOfficial) {
    officialToDerived.set(officialId, derivedId);
  }

  return matches.map((m) => {
    const derivedId = officialToDerived.get(m.id) ?? m.id;

    const dec = derivedResult.decisions.get(derivedId);
    const resultText = buildResultText(derivedId, derivedResult, holesPerMatch);
    if (dec) {
      const winnerPairId =
        dec.winner === "top" ? m.top_pair_id : m.bottom_pair_id;
      return {
        ...m,
        status: "completed",
        winner_pair_id: winnerPairId,
        result_text: resultText,
      };
    }
    if (resultText != null) {
      return { ...m, result_text: resultText };
    }
    return m;
  });
}

function holesFromDerived(
  derivedResult: DerivedMatchHolesResult,
  idMap: Map<string, string>
): LiveMatchPlayHoleRow[] {
  return derivedResult.holes.map((h) => ({
    match_id: idMap.get(h.match_id) ?? h.match_id,
    hole_no: h.hole_no,
    top_points: h.top_points,
    bottom_points: h.bottom_points,
    match_status_after: h.match_status_after,
  }));
}

/**
 * Arma el snapshot de matches-vivo: bracket oficial y/o salidas, con puntos
 * derivados desde `hole_scores` cuando no hay filas en `matchplay_hole_results`.
 */
export async function buildLiveStrokeSnapshot(
  admin: SupabaseClient,
  tournamentId: string
): Promise<LiveStrokeSnapshot> {
  const empty: LiveStrokeSnapshot = {
    matches: [],
    holes: [],
    bracketId: null,
    bracketSize: 0,
    roundCount: 0,
    liveFromStrokeScores: false,
    derivedFromPairings: false,
  };

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("holes_per_match")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const holesPerMatch = rulesRow?.holes_per_match === 9 ? 9 : 18;

  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id, config_json")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let bracketSize =
    (bracket?.config_json as { bracket_size?: number } | null)?.bracket_size ??
    0;
  let roundCount =
    bracketSize >= 2 ? roundCountForBracketSize(bracketSize) : 0;

  if (bracket?.id) {
    const bracketId = String(bracket.id);
    const { data: matchesRaw } = await admin
      .from("matchplay_matches")
      .select(
        "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
      )
      .eq("bracket_id", bracketId);

    let matches: LiveMatchPlayMatchRow[] = (matchesRaw ?? []).map((m) => ({
      ...m,
      bracket_id: String(m.bracket_id),
    }));

    const consolBracketId = await getConsolationBracketId(admin, tournamentId);
    if (consolBracketId) {
      const { data: consolRaw } = await admin
        .from("matchplay_matches")
        .select(
          "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
        )
        .eq("bracket_id", consolBracketId);
      const consolRows = (consolRaw ?? []).map((m) => ({
        ...m,
        bracket_id: String(m.bracket_id),
        result_text: m.result_text
          ? `Consolación · ${m.result_text}`
          : "Consolación Match Play",
      }));
      matches = [...matches, ...consolRows];
    }

    const matchIds = matches.map((m) => m.id);
    let holes: LiveMatchPlayHoleRow[] = [];
    let liveFromStrokeScores = false;

    if (matchIds.length > 0) {
      const { data: holeRows } = await admin
        .from("matchplay_hole_results")
        .select(
          "match_id, hole_no, top_points, bottom_points, match_status_after"
        )
        .in("match_id", matchIds);
      holes = holeRows ?? [];
    }

    if (holes.length === 0 && matches.length > 0) {
      const derivedAll = await derivePairingGroupMatches(admin, tournamentId);
      const derivedByPairKey = new Map<string, DerivedMatchRow>();
      for (const d of derivedAll.matches) {
        if (!d.top_pair_id || !d.bottom_pair_id) continue;
        const k = [d.top_pair_id, d.bottom_pair_id].sort().join("|");
        derivedByPairKey.set(`${d.round_no}:${k}`, d);
      }

      const inputs: DerivedMatchRow[] = [];
      const idMap = new Map<string, string>();
      for (const m of matches) {
        if (!m.top_pair_id || !m.bottom_pair_id) continue;
        const k = [m.top_pair_id, m.bottom_pair_id].sort().join("|");
        const d = derivedByPairKey.get(`${m.round_no}:${k}`);
        if (!d) continue;
        inputs.push({ ...d, status: "scheduled" });
        idMap.set(d.id, m.id);
      }

      if (inputs.length > 0) {
        const derivedResult = await deriveMatchHolesFromStrokes(
          admin,
          tournamentId,
          inputs
        );
        holes = holesFromDerived(derivedResult, idMap);
        liveFromStrokeScores = true;
        matches = applyDerivedToMatches(
          matches,
          derivedResult,
          idMap,
          holesPerMatch
        );
      }
    }

    return {
      matches,
      holes,
      bracketId,
      bracketSize,
      roundCount,
      liveFromStrokeScores,
      derivedFromPairings: false,
    };
  }

  const derived = await derivePairingGroupMatches(admin, tournamentId);
  if (derived.matches.length === 0) return empty;

  const derivedResult = await deriveMatchHolesFromStrokes(
    admin,
    tournamentId,
    derived.matches
  );

  bracketSize = derived.bracketSize;
  roundCount = derived.roundCount;

  const idMap = new Map<string, string>();
  for (const m of derived.matches) {
    idMap.set(m.id, m.id);
  }

  let matches: LiveMatchPlayMatchRow[] = derived.matches.map((m) => ({
    id: m.id,
    bracket_id: m.bracket_id,
    round_no: m.round_no,
    position_no: m.position_no,
    top_pair_id: m.top_pair_id,
    bottom_pair_id: m.bottom_pair_id,
    winner_pair_id: m.winner_pair_id,
    status: m.status,
    result_text: m.result_text,
  }));

  matches = applyDerivedToMatches(matches, derivedResult, idMap, holesPerMatch);

  return {
    matches,
    holes: holesFromDerived(derivedResult, idMap),
    bracketId: `derived-${tournamentId}`,
    bracketSize,
    roundCount,
    liveFromStrokeScores: true,
    derivedFromPairings: true,
  };
}
