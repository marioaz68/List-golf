import type { SupabaseClient } from "@supabase/supabase-js";

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
  puntos_arriba: number | null;
  puntos_abajo: number | null;
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

function hoyoFromResultText(resultText: string | null): number | null {
  if (!resultText) return null;
  const m = resultText.match(/H(\d+)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function matchEstado(args: {
  cerrado: boolean;
  empate: boolean;
  hoyoDecidido: number | null;
}): string {
  if (!args.cerrado) return "por jugar";
  if (args.empate) return "TIED";
  if (args.hoyoDecidido != null) return `H${args.hoyoDecidido}`;
  return "FINAL";
}

function matchVentaja(args: {
  cerrado: boolean;
  winnerPairId: string | null;
  topPairId: string | null;
  bottomPairId: string | null;
  isHalved: boolean;
}): RyderMatch["ventaja"] {
  if (
    args.winnerPairId &&
    args.topPairId &&
    args.winnerPairId === args.topPairId
  ) {
    return "home";
  }
  if (
    args.winnerPairId &&
    args.bottomPairId &&
    args.winnerPairId === args.bottomPairId
  ) {
    return "away";
  }
  if (args.cerrado && (args.isHalved || !args.winnerPairId)) return "tied";
  if (!args.cerrado) return null;
  return null;
}

function matchPoints(args: {
  pointsTop: number | null;
  pointsBottom: number | null;
  cerrado: boolean;
  isHalved: boolean;
  winnerPairId: string | null;
  topPairId: string | null;
  bottomPairId: string | null;
  pointsPerMatch: number;
}): { arriba: number | null; abajo: number | null } {
  if (args.pointsTop !== null) {
    return {
      arriba: Number(args.pointsTop),
      abajo:
        args.pointsBottom === null ? null : Number(args.pointsBottom),
    };
  }
  if (!args.cerrado) return { arriba: null, abajo: null };
  if (args.isHalved || !args.winnerPairId) {
    const half = args.pointsPerMatch / 2;
    return { arriba: half, abajo: half };
  }
  if (args.winnerPairId === args.topPairId) {
    return { arriba: args.pointsPerMatch, abajo: 0 };
  }
  if (args.winnerPairId === args.bottomPairId) {
    return { arriba: 0, abajo: args.pointsPerMatch };
  }
  const half = args.pointsPerMatch / 2;
  return { arriba: half, abajo: half };
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
    return { estado: "definido", texto: `${home.equipo} gana ${home.puntos}-${away.puntos}` };
  }
  if (away.puntos >= meta) {
    return { estado: "definido", texto: `${away.equipo} gana ${away.puntos}-${home.puntos}` };
  }
  if (repartidos >= cup.puntos_totales) {
    return { estado: "empate", texto: `${cup.tie_label} ${home.puntos}-${away.puntos}` };
  }
  const faltan = cup.puntos_totales - repartidos;
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
    .select("category_id, name, edition, retain_on_tie, tie_label, series_home_wins, series_away_wins, series_ties")
    .eq("tournament_id", tournamentId);
  if (!cupsRaw?.length) return null;

  const { data: marcador } = await db
    .from("matchplay_ryder_scoreboard")
    .select("*")
    .eq("tournament_id", tournamentId);

  const { data: sesionesRaw } = await db
    .from("matchplay_sessions")
    .select("id, session_no, name, scoring_format, category_id, match_count, points_per_match, handicap_allowance_pct, start_mode, start_tees")
    .eq("tournament_id", tournamentId)
    .order("session_no", { ascending: true });

  const { data: matchesRaw } = await db
    .from("matchplay_matches")
    .select(`
      id, session_id, round_no, position_no, status, is_halved,
      points_top, points_bottom, scheduled_at,
      result_text, winner_pair_id, top_pair_id, bottom_pair_id,
      top:top_pair_id ( team_name ),
      bottom:bottom_pair_id ( team_name )
    `)
    .eq("tournament_id", tournamentId)
    .order("position_no", { ascending: true });

  const copas: RyderCup[] = cupsRaw.map((cup: any) => {
    const filas = (marcador ?? []).filter((m: any) => m.category_id === cup.category_id);
    const primera = filas[0] as any;

    const equipos: RyderTeamStanding[] = filas
      .map((m: any) => ({
        team_id: m.team_id,
        side: m.side,
        equipo: m.equipo,
        color_hex: m.color_hex,
        puntos: Number(m.puntos ?? 0),
        ganados: Number(m.ganados ?? 0),
        empatados: Number(m.empatados ?? 0),
        perdidos: Number(m.perdidos ?? 0),
        en_juego: Number(m.en_juego ?? 0),
        campeon_vigente: Boolean(m.campeon_vigente),
      }))
      .sort((a, b) => (a.side === "home" ? -1 : 1));

    const sesiones: RyderSession[] = (sesionesRaw ?? [])
      .filter((s: any) => s.category_id === cup.category_id)
      .map((s: any) => {
        const pointsPerMatch = Number(s.points_per_match ?? 1);
        return {
          session_id: s.id,
          session_no: s.session_no,
          nombre: s.name,
          scoring_format: s.scoring_format,
          handicap_allowance_pct:
            s.handicap_allowance_pct === null ? null : Number(s.handicap_allowance_pct),
          start_mode: s.start_mode,
          start_tees: s.start_tees ?? null,
          puntos_por_partido: pointsPerMatch,
          partidos_esperados: s.match_count ?? null,
          matches: (matchesRaw ?? [])
            .filter((m: any) => m.session_id === s.id)
            .map((m: any) => {
              const cerrado = m.status === "completed";
              const resultText =
                typeof m.result_text === "string" ? m.result_text : null;
              const hoyoDecidido = hoyoFromResultText(resultText);
              const winnerPairId = m.winner_pair_id ?? null;
              const topPairId = m.top_pair_id ?? null;
              const bottomPairId = m.bottom_pair_id ?? null;
              const isHalved = Boolean(m.is_halved);
              const empate = cerrado && (isHalved || !winnerPairId);
              const ventaja = matchVentaja({
                cerrado,
                winnerPairId,
                topPairId,
                bottomPairId,
                isHalved,
              });
              const puntos = matchPoints({
                pointsTop: m.points_top === null ? null : Number(m.points_top),
                pointsBottom:
                  m.points_bottom === null ? null : Number(m.points_bottom),
                cerrado,
                isHalved,
                winnerPairId,
                topPairId,
                bottomPairId,
                pointsPerMatch,
              });
              return {
                match_id: m.id,
                session_no: s.session_no,
                position_no: m.position_no,
                grupo:
                  s.scoring_format === "singles"
                    ? Math.ceil(m.position_no / 2)
                    : m.position_no,
                scoring_format: s.scoring_format,
                status: m.status,
                arriba: m.top?.team_name ?? "-",
                abajo: m.bottom?.team_name ?? "-",
                puntos_arriba: puntos.arriba,
                puntos_abajo: puntos.abajo,
                is_halved: isHalved,
                marcador: null,
                hoyos: [],
                thru: hoyoDecidido ?? 0,
                estado: matchEstado({
                  cerrado,
                  empate,
                  hoyoDecidido,
                }),
                ventaja,
                tee_time: m.scheduled_at ?? null,
                starting_hole: s.start_tees?.[0] ?? null,
                resultado_texto: resultText,
                hoyo_decidido: hoyoDecidido,
              } as RyderMatch;
            }),
        };
      });

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
      ...(() => {
        let ps = 0;
        let pc = 0;
        let cerrados = 0;
        let totales = 0;
        for (const ses of sesiones) {
          for (const m of ses.matches) {
            totales += 1;
            if (m.puntos_arriba !== null) {
              cerrados += 1;
              ps += m.puntos_arriba;
              pc += m.puntos_abajo ?? 0;
            } else if (m.ventaja === "home") {
              ps += ses.puntos_por_partido;
            } else if (m.ventaja === "away") {
              pc += ses.puntos_por_partido;
            } else if (m.ventaja === "tied") {
              ps += ses.puntos_por_partido / 2;
              pc += ses.puntos_por_partido / 2;
            }
          }
        }
        return {
          proyectado: { socios: ps, caddies: pc },
          partidos_cerrados: cerrados,
          partidos_totales: totales,
        };
      })(),
      equipos,
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
