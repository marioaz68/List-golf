import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreLowHighHole,
  isLowHighMatchDecidedAt,
  type LowHighPlayerGross,
} from "./scoring/lowHigh";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import {
  effectivePhForMatchEntry,
  hiForMatchEntry,
} from "@/lib/matchplay/resolveEntryPhForMatch";
import type { StrokeIndexByHole } from "@/lib/leaderboard/handicapStrokes";
import { resolveMatchHandicapPct } from "./scoring/resolveHandicapPct";
import type {
  MatchPlayHandicapAllowance,
  MatchPlayMatchType,
  MatchPlayPairFormat,
} from "./types";
import type { DerivedMatchRow } from "./derivePairingGroupMatches";

export type DerivedMatchDecision = {
  decided_at_hole: number;
  winner: "top" | "bottom";
  top_total: number;
  bottom_total: number;
};

/**
 * Para cada match derivado (formato Bola Baja + Alta) calcula los puntos
 * hoyo por hoyo a partir de los `hole_scores` brutos capturados en
 * stroke play. Devuelve filas con la misma forma que `matchplay_hole_results`
 * para alimentar la página pública de matches-vivo cuando todavía no hay
 * un bracket oficial.
 *
 * Notas:
 *  - Si para un hoyo cualquiera de los 4 jugadores no tiene gross,
 *    ese hoyo se omite.
 *  - El allowance se aplica directamente al HI (fallback sin slope/rating
 *    cuando el comité aún no configuró WHS).
 */
export type DerivedHoleResultRow = {
  match_id: string;
  hole_no: number;
  top_points: number;
  bottom_points: number;
  match_status_after: string | null;
};

export type DerivedMatchHolesResult = {
  holes: DerivedHoleResultRow[];
  /** Match decidido matemáticamente antes del hoyo 18: clave = match_id. */
  decisions: Map<string, DerivedMatchDecision>;
};

export async function deriveMatchHolesFromStrokes(
  admin: SupabaseClient,
  tournamentId: string,
  matches: DerivedMatchRow[]
): Promise<DerivedMatchHolesResult> {
  const emptyResult: DerivedMatchHolesResult = {
    holes: [],
    decisions: new Map(),
  };
  const playable = matches.filter(
    (m) =>
      m.status === "scheduled" &&
      m.top_a_entry_id &&
      m.top_b_entry_id &&
      m.bottom_a_entry_id &&
      m.bottom_b_entry_id &&
      m.round_id
  );
  if (playable.length === 0) return emptyResult;

  // Reglas de match play del torneo (allowance + WHS opcional).
  const { data: rules } = await admin
    .from("tournament_matchplay_rules")
    .select(
      "pair_format, holes_per_match, handicap_allowance, handicap_allowance_pct, match_type"
    )
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const pair_format = (rules?.pair_format ?? "fourball") as MatchPlayPairFormat;
  if (pair_format !== "low_high") return emptyResult;

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

  // Stroke index por hoyo (campo handicap_index = SI del hoyo).
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

  // Cargar entries (HI + PH) y players (HI + handicap_torneo) para los 4
  // jugadores de cada match.
  const allEntryIds = Array.from(
    new Set(
      playable.flatMap((m) => [
        m.top_a_entry_id!,
        m.top_b_entry_id!,
        m.bottom_a_entry_id!,
        m.bottom_b_entry_id!,
      ])
    )
  );

  const handicapCtx = await loadTournamentHandicapContext(admin, tournamentId);

  const { data: entriesRaw } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, category_id, handicap_index, playing_handicap, course_handicap, playing_handicap_override, players:players(handicap_index, handicap_torneo, gender, birth_year)"
    )
    .in("id", allEntryIds);

  type EntryRow = {
    id: string;
    player_id: string;
    category_id: string | null;
    handicap_index: number | null;
    playing_handicap: number | null;
    course_handicap: number | null;
    playing_handicap_override: number | null;
    players: {
      handicap_index: number | null;
      handicap_torneo: number | null;
      gender: string | null;
      birth_year: number | null;
    } | Array<{
      handicap_index: number | null;
      handicap_torneo: number | null;
      gender: string | null;
      birth_year: number | null;
    }> | null;
  };

  const entryById = new Map<
    string,
    { player_id: string; hi: number; ph: number | null }
  >();
  for (const e of (entriesRaw ?? []) as EntryRow[]) {
    const p = Array.isArray(e.players) ? e.players[0] : e.players;
    const phEffective = effectivePhForMatchEntry(
      {
        id: e.id,
        player_id: e.player_id,
        category_id: e.category_id,
        handicap_index: e.handicap_index,
        playing_handicap: e.playing_handicap,
        playing_handicap_override: e.playing_handicap_override,
        player: p
          ? {
              gender: p.gender,
              birth_year: p.birth_year,
              handicap_index: p.handicap_index,
              handicap_torneo: p.handicap_torneo,
            }
          : null,
      },
      handicapCtx
    );
    entryById.set(e.id, {
      player_id: e.player_id,
      hi: hiForMatchEntry({
        id: e.id,
        player_id: e.player_id,
        handicap_index: e.handicap_index,
        player: p
          ? {
              handicap_index: p.handicap_index,
              handicap_torneo: p.handicap_torneo,
            }
          : null,
      }),
      ph: phEffective,
    });
  }

  // Cargar todos los hole_scores stroke play para los players involucrados
  // en estos matches (por round_id correspondiente a cada match).
  type RoundScoreRow = {
    id: string;
    player_id: string;
    round_id: string;
  };
  type HoleScoreRow = {
    round_score_id: string;
    hole_number: number | null;
    hole_no: number | null;
    strokes: number | null;
  };

  const playerIds = Array.from(
    new Set(
      Array.from(entryById.values()).map((e) => e.player_id)
    )
  );
  const roundIds = Array.from(new Set(playable.map((m) => m.round_id)));

  const { data: roundScoresRaw } = await admin
    .from("round_scores")
    .select("id, player_id, round_id")
    .in("player_id", playerIds)
    .in("round_id", roundIds);
  const roundScores = (roundScoresRaw ?? []) as RoundScoreRow[];

  const rsByPlayerRound = new Map<string, string>();
  for (const rs of roundScores) {
    rsByPlayerRound.set(`${rs.player_id}_${rs.round_id}`, rs.id);
  }

  const roundScoreIds = roundScores.map((rs) => rs.id);
  let holeScores: HoleScoreRow[] = [];
  if (roundScoreIds.length > 0) {
    const { data: hsRaw } = await admin
      .from("hole_scores")
      .select("round_score_id, hole_number, hole_no, strokes")
      .in("round_score_id", roundScoreIds);
    holeScores = (hsRaw ?? []) as HoleScoreRow[];
  }

  // Mapa: round_score_id -> hole_no -> gross
  const grossByRsHole = new Map<string, Map<number, number>>();
  for (const hs of holeScores) {
    const holeNo = hs.hole_number ?? hs.hole_no;
    if (holeNo == null) continue;
    const g = hs.strokes;
    if (g == null) continue;
    const m = grossByRsHole.get(hs.round_score_id) ?? new Map<number, number>();
    m.set(Number(holeNo), Number(g));
    grossByRsHole.set(hs.round_score_id, m);
  }

  function grossForEntryHole(entryId: string, roundId: string, holeNo: number): number | null {
    const e = entryById.get(entryId);
    if (!e) return null;
    const rsId = rsByPlayerRound.get(`${e.player_id}_${roundId}`);
    if (!rsId) return null;
    const m = grossByRsHole.get(rsId);
    if (!m) return null;
    const v = m.get(holeNo);
    return v != null ? v : null;
  }

  const out: DerivedHoleResultRow[] = [];
  const decisions = new Map<string, DerivedMatchDecision>();

  for (const m of playable) {
    const eTopA = entryById.get(m.top_a_entry_id!);
    const eTopB = entryById.get(m.top_b_entry_id!);
    const eBotA = entryById.get(m.bottom_a_entry_id!);
    const eBotB = entryById.get(m.bottom_b_entry_id!);
    if (!eTopA || !eTopB || !eBotA || !eBotB) continue;

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

    let topTotal = 0;
    let bottomTotal = 0;
    let decidedAtHole: number | null = null;

    for (let h = 1; h <= holes_in_match; h++) {
      const top_a = grossForEntryHole(m.top_a_entry_id!, m.round_id, h);
      const top_b = grossForEntryHole(m.top_b_entry_id!, m.round_id, h);
      const bottom_a = grossForEntryHole(m.bottom_a_entry_id!, m.round_id, h);
      const bottom_b = grossForEntryHole(m.bottom_b_entry_id!, m.round_id, h);

      if (top_a == null || top_b == null || bottom_a == null || bottom_b == null) {
        continue;
      }

      // Match ya decidido por marcador: los hoyos siguientes ya no
      // contribuyen a los puntos del match (aunque la tarjeta se siga
      // capturando para stroke play). Registramos la fila con 0 pts
      // para que el UI muestre que el hoyo se jugó "fuera de match".
      if (decidedAtHole != null) {
        out.push({
          match_id: m.id,
          hole_no: h,
          top_points: 0,
          bottom_points: 0,
          match_status_after: `Decidido en H${decidedAtHole}`,
        });
        continue;
      }

      const gross: LowHighPlayerGross = { top_a, top_b, bottom_a, bottom_b };

      const res = scoreLowHighHole({
        hole_no: h,
        gross,
        hi,
        allowance_pct,
        playing_handicaps: phs,
        strokeIndexByHole,
        top_total_before: topTotal,
        bottom_total_before: bottomTotal,
        holes_in_match,
      });
      if (!res) continue;

      topTotal += res.top_points;
      bottomTotal += res.bottom_points;

      out.push({
        match_id: m.id,
        hole_no: h,
        top_points: res.top_points,
        bottom_points: res.bottom_points,
        match_status_after: res.match_status_after,
      });

      const winner = isLowHighMatchDecidedAt({
        top_total: topTotal,
        bottom_total: bottomTotal,
        hole_no: h,
        holes_in_match,
      });
      if (winner) {
        decidedAtHole = h;
        decisions.set(m.id, {
          decided_at_hole: h,
          winner,
          top_total: topTotal,
          bottom_total: bottomTotal,
        });
      }
    }
  }

  return { holes: out, decisions };
}
