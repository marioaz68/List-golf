import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadMatchForScoring,
  type MatchForScoring,
} from "@/lib/matchplay/loadMatchForScoring";
import { formatLowHighDecisionResult } from "@/lib/matchplay/scoring/lowHigh";
import { formatSinglesDecisionResult } from "@/lib/matchplay/scoring/singles";

export type RyderTeamStanding = {
  team_id: string;
  side: "home" | "away";
  equipo: string;
  color_hex: string | null;
  puntos: number;
  ganados: number;
  empatados: number;
  perdidos: number;
  en_juego: number;
  campeon_vigente: boolean;
};

export type RyderMatch = {
  match_id: string;
  session_no: number;
  position_no: number;
  grupo: number | null;
  scoring_format: string;
  status: string;
  arriba: string;
  abajo: string;
  /** Puntos de copa que aporta el match (null si aún no está decidido). */
  puntos_arriba: number | null;
  puntos_abajo: number | null;
  /** Totales acumulados del scoring del match (hoyos). */
  top_total: number;
  bottom_total: number;
  is_halved: boolean;
  marcador: string | null;
  hoyos: Array<{ hole_no: number; arriba: number; abajo: number }>;
  thru: number;
  estado: string;
  ventaja: "home" | "away" | "tied" | null;
  tee_time: string | null;
  starting_hole: number | null;
  resultado_texto: string | null;
  hoyo_decidido: number | null;
};

export type RyderSession = {
  session_id: string;
  session_no: number;
  nombre: string;
  scoring_format: string;
  handicap_allowance_pct: number | null;
  start_mode: string;
  start_tees: number[] | null;
  puntos_por_partido: number;
  partidos_esperados: number | null;
  matches: RyderMatch[];
};

export type RyderCup = {
  category_id: string;
  categoria_code: string;
  categoria: string;
  copa: string;
  edition: number | null;
  serie: { socios: number; caddies: number; empates: number };
  retain_on_tie: boolean;
  tie_label: string;
  puntos_totales: number;
  puntos_para_ganar: number;
  proyectado: { socios: number; caddies: number };
  partidos_cerrados: number;
  partidos_totales: number;
  equipos: RyderTeamStanding[];
  sesiones: RyderSession[];
  resultado: { estado: "en_juego" | "definido" | "empate"; texto: string };
};

export type RyderPublicData = {
  tournament_id: string;
  nombre: string;
  fecha: string;
  copas: RyderCup[];
};

function holeHasScore(h: MatchForScoring["holes"][number]): boolean {
  return (
    h.top_points != null ||
    h.bottom_points != null ||
    h.top_player_a_strokes != null ||
    h.top_player_b_strokes != null ||
    h.bottom_player_a_strokes != null ||
    h.bottom_player_b_strokes != null
  );
}

function matchEstado(args: {
  cerrado: boolean;
  empate: boolean;
  thru: number;
  hoyoDecidido: number | null;
  holesInMatch: number;
}): string {
  if (!args.cerrado && args.thru <= 0) return "por jugar";
  if (args.empate) return "EMPATE";
  if (
    args.cerrado &&
    args.hoyoDecidido != null &&
    args.hoyoDecidido < args.holesInMatch
  ) {
    return `H${args.hoyoDecidido}`;
  }
  if (args.cerrado) return "FINAL";
  if (args.thru > 0) return `H${args.thru}`;
  return "por jugar";
}

type LiveSummary = {
  top_total: number;
  bottom_total: number;
  thru: number;
  decided_at_hole: number | null;
  cerrado: boolean;
  empate: boolean;
  needs_playoff: boolean;
  resultado_texto: string | null;
  scoring_format: string;
  hoyos: Array<{ hole_no: number; arriba: number; abajo: number }>;
  status: string;
};

function fmtHolePts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

/**
 * Regla Ryder: terminado si ya se jugaron todos los hoyos, o si la
 * diferencia de puntos de hoyo supera lo que queda por repartir.
 * Un AS al 18 es empate (medio punto de copa), no playoff.
 */
function isMatchTerminado(args: {
  thru: number;
  holesInMatch: number;
  topTotal: number;
  bottomTotal: number;
  puntosPorHoyo: number;
}): boolean {
  const restantes = Math.max(0, args.holesInMatch - args.thru);
  const diff = Math.abs(args.topTotal - args.bottomTotal);
  return (
    args.thru >= args.holesInMatch ||
    diff > restantes * args.puntosPorHoyo
  );
}

function summarizeScoring(
  scoring: MatchForScoring | null,
  sessionFormat: string
): LiveSummary {
  if (!scoring) {
    return {
      top_total: 0,
      bottom_total: 0,
      thru: 0,
      decided_at_hole: null,
      cerrado: false,
      empate: false,
      needs_playoff: false,
      resultado_texto: null,
      scoring_format: sessionFormat,
      hoyos: [],
      status: "scheduled",
    };
  }

  const scoringFormat = scoring.scoring_format ?? sessionFormat;
  const isSingles = scoringFormat === "singles";
  const holesInMatch = scoring.holes_in_match;
  const puntosPorHoyo = isSingles ? 1 : 2;

  let topAcc = 0;
  let bottomAcc = 0;
  let thru = 0;
  let decidedAtHole: number | null = null;
  let lastStatus: string | null = null;
  const hoyos: LiveSummary["hoyos"] = [];

  for (const h of scoring.holes) {
    if (h.hole_no > holesInMatch) continue;
    if (!holeHasScore(h)) continue;

    if (h.top_points != null || h.bottom_points != null) {
      hoyos.push({
        hole_no: h.hole_no,
        arriba: Number(h.top_points ?? 0),
        abajo: Number(h.bottom_points ?? 0),
      });
    }

    const tp = Number(h.top_points ?? 0);
    const bp = Number(h.bottom_points ?? 0);
    if (h.top_points != null || h.bottom_points != null) {
      topAcc += tp;
      bottomAcc += bp;
      thru += 1;
    }
    if (h.match_status_after) lastStatus = h.match_status_after;

    if (decidedAtHole == null) {
      const early = isMatchTerminado({
        thru,
        holesInMatch,
        topTotal: topAcc,
        bottomTotal: bottomAcc,
        puntosPorHoyo,
      });
      // Cierre anticipado: terminó antes del último hoyo con un ganador.
      if (early && thru < holesInMatch && topAcc !== bottomAcc) {
        decidedAtHole = h.hole_no;
      }
    }
  }

  // Hoyos de desempate (19+): solo si ya hubo AS al 18 y se capturaron.
  // En Ryder un AS al 18 cierra como empate de copa; no exigimos playoff.
  for (const h of scoring.holes) {
    if (h.hole_no <= holesInMatch) continue;
    if (!holeHasScore(h)) continue;
    if (h.top_points != null || h.bottom_points != null) {
      hoyos.push({
        hole_no: h.hole_no,
        arriba: Number(h.top_points ?? 0),
        abajo: Number(h.bottom_points ?? 0),
      });
    }
  }

  const terminado = isMatchTerminado({
    thru,
    holesInMatch,
    topTotal: topAcc,
    bottomTotal: bottomAcc,
    puntosPorHoyo,
  });
  const diff = topAcc - bottomAcc;
  const empate = terminado && diff === 0 && thru > 0;
  const cerrado = terminado && thru > 0;

  if (cerrado && !empate && decidedAtHole == null) {
    decidedAtHole = Math.min(thru, holesInMatch);
  }

  const thruDisplay =
    hoyos.length > 0
      ? Math.max(
          ...hoyos
            .filter((h) => h.hole_no <= holesInMatch)
            .map((h) => h.hole_no),
          0
        )
      : 0;

  let resultado_texto: string | null = null;
  if (empate) {
    resultado_texto = `AS · ${fmtHolePts(topAcc)}-${fmtHolePts(bottomAcc)} en hoyos`;
  } else if (cerrado && decidedAtHole != null) {
    const winnerLabel =
      diff > 0 ? scoring.top_label : scoring.bottom_label;
    resultado_texto = isSingles
      ? formatSinglesDecisionResult({
          winner_label: winnerLabel,
          top_total: topAcc,
          bottom_total: bottomAcc,
          decided_at_hole: decidedAtHole,
          holes_in_match: holesInMatch,
        })
      : formatLowHighDecisionResult({
          winner_label: winnerLabel,
          top_total: topAcc,
          bottom_total: bottomAcc,
          decided_at_hole: decidedAtHole,
          holes_in_match: holesInMatch,
        });
  } else {
    resultado_texto =
      lastStatus ??
      (typeof scoring.result_text === "string" ? scoring.result_text : null);
  }

  return {
    top_total: topAcc,
    bottom_total: bottomAcc,
    thru: thruDisplay || thru,
    decided_at_hole: decidedAtHole,
    cerrado,
    empate,
    needs_playoff: false,
    resultado_texto,
    scoring_format: scoringFormat,
    hoyos,
    status: cerrado ? "completed" : thru > 0 ? "in_progress" : "scheduled",
  };
}

function cupPointsFromLive(
  live: LiveSummary,
  pointsPerMatch: number
): { arriba: number | null; abajo: number | null } {
  if (!live.cerrado) return { arriba: null, abajo: null };
  if (live.empate || live.top_total === live.bottom_total) {
    const half = pointsPerMatch / 2;
    return { arriba: half, abajo: half };
  }
  if (live.top_total > live.bottom_total) {
    return { arriba: pointsPerMatch, abajo: 0 };
  }
  return { arriba: 0, abajo: pointsPerMatch };
}

function liveVentaja(live: LiveSummary): RyderMatch["ventaja"] {
  if (live.thru <= 0 && !live.cerrado) return null;
  if (live.top_total > live.bottom_total) return "home";
  if (live.bottom_total > live.top_total) return "away";
  if (live.thru > 0 || live.cerrado) return "tied";
  return null;
}

function resolverResultado(
  cup: Omit<RyderCup, "resultado">
): RyderCup["resultado"] {
  const home = cup.equipos.find((e) => e.side === "home");
  const away = cup.equipos.find((e) => e.side === "away");
  if (!home || !away) return { estado: "en_juego", texto: "Sin equipos" };

  const meta = cup.puntos_para_ganar;
  const repartidos = home.puntos + away.puntos;

  if (home.puntos >= meta) {
    return {
      estado: "definido",
      texto: `${home.equipo} gana ${home.puntos}-${away.puntos}`,
    };
  }
  if (away.puntos >= meta) {
    return {
      estado: "definido",
      texto: `${away.equipo} gana ${away.puntos}-${home.puntos}`,
    };
  }
  if (repartidos >= cup.puntos_totales && cup.puntos_totales > 0) {
    return {
      estado: "empate",
      texto: `${cup.tie_label} ${home.puntos}-${away.puntos}`,
    };
  }
  const faltan = Math.max(0, cup.puntos_totales - repartidos);
  return {
    estado: "en_juego",
    texto: `${home.puntos}-${away.puntos} · ${faltan} punto${faltan === 1 ? "" : "s"} en juego`,
  };
}

export async function loadRyderPublic(
  db: SupabaseClient,
  tournamentId: string
): Promise<RyderPublicData | null> {
  if (!tournamentId) return null;

  const { data: torneo } = await db
    .from("tournaments")
    .select("id, name, start_date")
    .eq("id", tournamentId)
    .maybeSingle();
  if (!torneo) return null;

  const { data: cupsRaw } = await db
    .from("matchplay_ryder_cups")
    .select(
      "category_id, name, edition, retain_on_tie, tie_label, series_home_wins, series_away_wins, series_ties"
    )
    .eq("tournament_id", tournamentId);
  if (!cupsRaw?.length) return null;

  const { data: marcador } = await db
    .from("matchplay_ryder_scoreboard")
    .select("*")
    .eq("tournament_id", tournamentId);

  const { data: sesionesRaw } = await db
    .from("matchplay_sessions")
    .select(
      "id, session_no, name, scoring_format, category_id, match_count, points_per_match, handicap_allowance_pct, start_mode, start_tees"
    )
    .eq("tournament_id", tournamentId)
    .order("session_no", { ascending: true });

  const { data: matchesRaw } = await db
    .from("matchplay_matches")
    .select(
      `
      id, session_id, round_no, position_no, scheduled_at,
      top_pair_id, bottom_pair_id,
      top:top_pair_id ( team_name ),
      bottom:bottom_pair_id ( team_name )
    `
    )
    .eq("tournament_id", tournamentId)
    .order("position_no", { ascending: true });

  const matchList = matchesRaw ?? [];
  const scoringPairs = await Promise.all(
    matchList.map(async (m: { id: string }) => {
      const scoring = await loadMatchForScoring(m.id);
      return [m.id, scoring] as const;
    })
  );
  const scoringById = new Map<string, MatchForScoring | null>(scoringPairs);

  const copas: RyderCup[] = cupsRaw.map((cup: any) => {
    const filas = (marcador ?? []).filter(
      (m: any) => m.category_id === cup.category_id
    );
    const primera = filas[0] as any;

    const equiposBase: RyderTeamStanding[] = filas
      .map((m: any) => ({
        team_id: m.team_id,
        side: m.side as "home" | "away",
        equipo: m.equipo,
        color_hex: m.color_hex,
        puntos: 0,
        ganados: 0,
        empatados: 0,
        perdidos: 0,
        en_juego: 0,
        campeon_vigente: Boolean(m.campeon_vigente),
      }))
      .sort((a, b) => (a.side === "home" ? -1 : 1));

    const sesiones: RyderSession[] = (sesionesRaw ?? [])
      .filter((s: any) => s.category_id === cup.category_id)
      .map((s: any) => {
        const pointsPerMatch = Number(s.points_per_match ?? 1);
        const sessionFormat = String(s.scoring_format ?? "");
        return {
          session_id: s.id,
          session_no: s.session_no,
          nombre: s.name,
          scoring_format: sessionFormat,
          handicap_allowance_pct:
            s.handicap_allowance_pct === null
              ? null
              : Number(s.handicap_allowance_pct),
          start_mode: s.start_mode,
          start_tees: s.start_tees ?? null,
          puntos_por_partido: pointsPerMatch,
          partidos_esperados: s.match_count ?? null,
          matches: matchList
            .filter((m: any) => m.session_id === s.id)
            .map((m: any) => {
              const scoring = scoringById.get(m.id) ?? null;
              const live = summarizeScoring(scoring, sessionFormat);
              const puntos = cupPointsFromLive(live, pointsPerMatch);
              const ventaja = liveVentaja(live);
              const hoyoDecidido =
                live.decided_at_hole != null
                  ? Math.min(live.decided_at_hole, live.thru || live.decided_at_hole)
                  : null;

              return {
                match_id: m.id,
                session_no: s.session_no,
                position_no: m.position_no,
                grupo:
                  sessionFormat === "singles"
                    ? Math.ceil(m.position_no / 2)
                    : m.position_no,
                scoring_format: live.scoring_format || sessionFormat,
                status: live.status,
                arriba:
                  scoring?.top_label ?? m.top?.team_name ?? "-",
                abajo:
                  scoring?.bottom_label ?? m.bottom?.team_name ?? "-",
                puntos_arriba: puntos.arriba,
                puntos_abajo: puntos.abajo,
                top_total: live.top_total,
                bottom_total: live.bottom_total,
                is_halved: live.empate,
                marcador: null,
                hoyos: live.hoyos,
                thru: live.thru,
                estado: matchEstado({
                  cerrado: live.cerrado,
                  empate: live.empate,
                  thru: live.thru,
                  hoyoDecidido,
                  holesInMatch: scoring?.holes_in_match ?? 18,
                }),
                ventaja,
                tee_time: m.scheduled_at ?? null,
                starting_hole: s.start_tees?.[0] ?? null,
                resultado_texto: live.resultado_texto,
                hoyo_decidido: hoyoDecidido,
              } as RyderMatch;
            }),
        };
      });

    const home = equiposBase.find((e) => e.side === "home");
    const away = equiposBase.find((e) => e.side === "away");

    let ps = 0;
    let pc = 0;
    let cerrados = 0;
    let totales = 0;

    for (const ses of sesiones) {
      for (const m of ses.matches) {
        totales += 1;
        if (m.puntos_arriba !== null) {
          cerrados += 1;
          const pa = m.puntos_arriba;
          const pb = m.puntos_abajo ?? 0;
          ps += pa;
          pc += pb;
          if (home && away) {
            home.puntos += pa;
            away.puntos += pb;
            if (pa > pb) {
              home.ganados += 1;
              away.perdidos += 1;
            } else if (pb > pa) {
              away.ganados += 1;
              home.perdidos += 1;
            } else {
              home.empatados += 1;
              away.empatados += 1;
            }
          }
        } else {
          if (home) home.en_juego += 1;
          if (away) away.en_juego += 1;
          // Proyectado: acredita al que va arriba aunque no haya cerrado.
          if (m.ventaja === "home") {
            ps += ses.puntos_por_partido;
            pc += 0;
          } else if (m.ventaja === "away") {
            ps += 0;
            pc += ses.puntos_por_partido;
          } else if (m.ventaja === "tied") {
            ps += ses.puntos_por_partido / 2;
            pc += ses.puntos_por_partido / 2;
          }
        }
      }
    }

    // Proyectado de cerrados ya está en ps/pc; los en juego se sumaron arriba.
    // Los cerrados también deben contar en proyectado (= puntos reales + proyección).
    // Ya están sumados en el branch puntos_arriba !== null.

    const base = {
      category_id: cup.category_id,
      categoria_code: primera?.categoria_code ?? "",
      categoria: primera?.categoria ?? "",
      copa: cup.name,
      edition: cup.edition,
      serie: {
        socios: Number(cup.series_home_wins ?? 0),
        caddies: Number(cup.series_away_wins ?? 0),
        empates: Number(cup.series_ties ?? 0),
      },
      retain_on_tie: Boolean(cup.retain_on_tie),
      tie_label: cup.tie_label ?? "Empate",
      puntos_totales: Number(primera?.puntos_totales ?? 0),
      puntos_para_ganar: Number(primera?.puntos_para_ganar ?? 0),
      proyectado: { socios: ps, caddies: pc },
      partidos_cerrados: cerrados,
      partidos_totales: totales,
      equipos: equiposBase,
      sesiones,
    };

    return { ...base, resultado: resolverResultado(base) };
  });

  copas.sort((a, b) => a.categoria_code.localeCompare(b.categoria_code));

  return {
    tournament_id: torneo.id,
    nombre: torneo.name,
    fecha: torneo.start_date,
    copas,
  };
}
