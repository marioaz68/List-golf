import type { SupabaseClient } from "@supabase/supabase-js";
import {
  scoreLowHighHole,
  isLowHighMatchDecidedAt,
  type LowHighPlayerGross,
} from "./scoring/lowHigh";
import { loadTournamentHandicapContext } from "@/lib/handicap/loadTournamentHandicapContext";
import { loadCourseLayoutForTournament } from "./loadCourseLayout";
import {
  effectivePhForMatchEntry,
  hiForMatchEntry,
} from "@/lib/matchplay/resolveEntryPhForMatch";
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
  /** Si la decisión sucedió en el tramo de desempate (hoyos 19-27). */
  via_playoff?: boolean;
  /** Hoyo dentro del playoff (1..9) — solo si `via_playoff` es true. */
  playoff_hole?: number;
};

/** Estado del match al final del recorrido normal (hoyo 18). */
export type DerivedMatchSummary = {
  /** All-square al 18 con al menos 1 punto en juego → necesita desempate. */
  needs_playoff: boolean;
  /** Total acumulado top tras los 18 hoyos (incluye decididos antes). */
  top_total: number;
  bottom_total: number;
  decided_at_hole_18: boolean;
  /** Desempate iniciado pero falta al menos un score (1-9 físico). */
  playoff_pending_hole?: number;
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
  /** Resumen por match (incluye flag de necesidad de desempate). */
  summaries: Map<string, DerivedMatchSummary>;
};

export async function deriveMatchHolesFromStrokes(
  admin: SupabaseClient,
  tournamentId: string,
  matches: DerivedMatchRow[]
): Promise<DerivedMatchHolesResult> {
  const emptyResult: DerivedMatchHolesResult = {
    holes: [],
    decisions: new Map(),
    summaries: new Map(),
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
  // Fallback automático a course_holes si tournament_holes no lo tiene.
  const { strokeIndexByHole } = await loadCourseLayoutForTournament(
    admin,
    tournamentId
  );

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
  let holeScores: (HoleScoreRow & { picked_up?: boolean | null })[] = [];
  if (roundScoreIds.length > 0) {
    const { data: hsRaw } = await admin
      .from("hole_scores")
      .select("round_score_id, hole_number, hole_no, strokes, picked_up")
      .in("round_score_id", roundScoreIds);
    holeScores = (hsRaw ?? []) as (HoleScoreRow & { picked_up?: boolean | null })[];
  }

  // Mapa: round_score_id -> hole_no -> { gross, pickedUp }
  type HoleEntry = { gross: number | null; pickedUp: boolean };
  const holesByRs = new Map<string, Map<number, HoleEntry>>();
  for (const hs of holeScores) {
    const holeNo = hs.hole_number ?? hs.hole_no;
    if (holeNo == null) continue;
    const picked = Boolean(hs.picked_up);
    const gross = hs.strokes != null ? Number(hs.strokes) : null;
    if (gross == null && !picked) continue;
    const m = holesByRs.get(hs.round_score_id) ?? new Map<number, HoleEntry>();
    m.set(Number(holeNo), { gross, pickedUp: picked });
    holesByRs.set(hs.round_score_id, m);
  }

  function holeForEntry(
    entryId: string,
    roundId: string,
    holeNo: number
  ): HoleEntry | null {
    const e = entryById.get(entryId);
    if (!e) return null;
    const rsId = rsByPlayerRound.get(`${e.player_id}_${roundId}`);
    if (!rsId) return null;
    const m = holesByRs.get(rsId);
    if (!m) return null;
    return m.get(holeNo) ?? null;
  }

  function grossForEntryHole(
    entryId: string,
    roundId: string,
    holeNo: number
  ): number | null {
    return holeForEntry(entryId, roundId, holeNo)?.gross ?? null;
  }

  function pickedUpForEntryHole(
    entryId: string,
    roundId: string,
    holeNo: number
  ): boolean {
    return Boolean(holeForEntry(entryId, roundId, holeNo)?.pickedUp);
  }

  const out: DerivedHoleResultRow[] = [];
  const decisions = new Map<string, DerivedMatchDecision>();
  const summaries = new Map<string, DerivedMatchSummary>();

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
      const puTopA = pickedUpForEntryHole(m.top_a_entry_id!, m.round_id, h);
      const puTopB = pickedUpForEntryHole(m.top_b_entry_id!, m.round_id, h);
      const puBotA = pickedUpForEntryHole(m.bottom_a_entry_id!, m.round_id, h);
      const puBotB = pickedUpForEntryHole(m.bottom_b_entry_id!, m.round_id, h);

      // Para calcular el hoyo necesitamos que cada jugador tenga score o
      // bandera de "levantó". Si alguno todavía no tiene ninguno de los
      // dos, saltamos el hoyo.
      if (
        (top_a == null && !puTopA) ||
        (top_b == null && !puTopB) ||
        (bottom_a == null && !puBotA) ||
        (bottom_b == null && !puBotB)
      ) {
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
        picked_up: [puTopA, puTopB, puBotA, puBotB],
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

    // ─── Desempate (muerte súbita) ────────────────────────────────────
    // Si al hoyo 18 sigue empatado y hubo al menos un punto en juego,
    // se procede al desempate en los hoyos 1-9 (almacenados como 19-27).
    //
    // Regla de cierre (muerte súbita):
    //   Cada hoyo sigue valiendo hasta 2 puntos (1 bola baja + 1 bola
    //   alta). El match termina en el primer hoyo donde una pareja saque
    //   ventaja neta de puntos (top_pts ≠ bottom_pts). Si ambas parejas
    //   sacan el mismo número de puntos en ese hoyo (clásico: una gana
    //   bola baja y la otra gana bola alta → 1-1), el hoyo queda
    //   empatado y se sigue al siguiente. Si ambas sub-competencias se
    //   reparten (halved-halved → 0.5+0.5 = 1 para cada pareja) también
    //   queda empatado y se continúa.
    const isAllSquareAt18 =
      decidedAtHole == null &&
      holes_in_match === 18 &&
      topTotal === bottomTotal;
    const playedAnyHole = topTotal + bottomTotal > 0;
    let needsPlayoff = isAllSquareAt18 && playedAnyHole;
    let playoffPendingHole: number | undefined;

    if (needsPlayoff) {
      for (let p = 1; p <= 9; p++) {
        const storeHole = 18 + p; // 19..27 en hole_scores
        const top_a = grossForEntryHole(
          m.top_a_entry_id!,
          m.round_id,
          storeHole
        );
        const top_b = grossForEntryHole(
          m.top_b_entry_id!,
          m.round_id,
          storeHole
        );
        const bottom_a = grossForEntryHole(
          m.bottom_a_entry_id!,
          m.round_id,
          storeHole
        );
        const bottom_b = grossForEntryHole(
          m.bottom_b_entry_id!,
          m.round_id,
          storeHole
        );
        const puTopA = pickedUpForEntryHole(
          m.top_a_entry_id!,
          m.round_id,
          storeHole
        );
        const puTopB = pickedUpForEntryHole(
          m.top_b_entry_id!,
          m.round_id,
          storeHole
        );
        const puBotA = pickedUpForEntryHole(
          m.bottom_a_entry_id!,
          m.round_id,
          storeHole
        );
        const puBotB = pickedUpForEntryHole(
          m.bottom_b_entry_id!,
          m.round_id,
          storeHole
        );
        if (
          (top_a == null && !puTopA) ||
          (top_b == null && !puTopB) ||
          (bottom_a == null && !puBotA) ||
          (bottom_b == null && !puBotB)
        ) {
          // Falta capturar este hoyo del playoff. Detenemos aquí.
          playoffPendingHole = p;
          break;
        }

        const gross: LowHighPlayerGross = { top_a, top_b, bottom_a, bottom_b };
        const res = scoreLowHighHole({
          hole_no: storeHole, // usa playoffSourceHole → SI del hoyo físico p
          gross,
          hi,
          allowance_pct,
          playing_handicaps: phs,
          strokeIndexByHole,
          top_total_before: topTotal,
          bottom_total_before: bottomTotal,
          holes_in_match: 27,
          picked_up: [puTopA, puTopB, puBotA, puBotB],
        });
        if (!res) break;

        topTotal += res.top_points;
        bottomTotal += res.bottom_points;

        out.push({
          match_id: m.id,
          hole_no: storeHole,
          top_points: res.top_points,
          bottom_points: res.bottom_points,
          match_status_after: `Playoff H${p}`,
        });

        if (res.top_points !== res.bottom_points) {
          // Muerte súbita: en cuanto una pareja saque ventaja neta de
          // puntos en el hoyo (p.ej. 2-0, 1.5-0.5, 1-0.5), el match
          // termina. Si quedó 1-1 (split de subcompetencias) o 0-0,
          // el hoyo está empatado y se sigue al próximo.
          decidedAtHole = storeHole;
          decisions.set(m.id, {
            decided_at_hole: storeHole,
            winner: res.top_points > res.bottom_points ? "top" : "bottom",
            top_total: topTotal,
            bottom_total: bottomTotal,
            via_playoff: true,
            playoff_hole: p,
          });
          needsPlayoff = false;
          break;
        }
      }
    }

    summaries.set(m.id, {
      needs_playoff: needsPlayoff,
      top_total: topTotal,
      bottom_total: bottomTotal,
      decided_at_hole_18:
        decidedAtHole != null && decidedAtHole <= 18,
      playoff_pending_hole: playoffPendingHole,
    });
  }

  return { holes: out, decisions, summaries };
}
