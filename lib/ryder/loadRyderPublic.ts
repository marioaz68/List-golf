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

function resolverEstado(
  hoyos: RyderMatch["hoyos"],
  formato: string,
  holesInMatch: number,
  cerrado: boolean,
  halved: boolean
): { estado: string; ventaja: RyderMatch["ventaja"] } {
  if (!hoyos.length) {
    return { estado: cerrado ? "final" : "por jugar", ventaja: null };
  }
  const thru = hoyos.length;
  const restantes = Math.max(0, holesInMatch - thru);

  if (formato === "low_high") {
    const a = hoyos.reduce((n, h) => n + h.arriba, 0);
    const b = hoyos.reduce((n, h) => n + h.abajo, 0);
    const ventaja = a > b ? "home" : b > a ? "away" : "tied";
    const txt = `${a}-${b} pts`;
    return { estado: cerrado ? txt : `${txt} · ${thru}`, ventaja };
  }

  let arriba = 0;
  let abajo = 0;
  for (const h of hoyos) {
    if (h.arriba > h.abajo) arriba += 1;
    else if (h.abajo > h.arriba) abajo += 1;
  }
  const lead = arriba - abajo;
  const ventaja = lead > 0 ? "home" : lead < 0 ? "away" : "tied";

  if (cerrado) {
    if (halved || lead === 0) return { estado: "TIED", ventaja: "tied" };
    if (restantes === 0) return { estado: `${Math.abs(lead)} UP`, ventaja };
    return { estado: `${Math.abs(lead)}&${restantes}`, ventaja };
  }
  if (lead === 0) return { estado: `AS · ${thru}`, ventaja };
  return { estado: `${Math.abs(lead)} UP · ${thru}`, ventaja };
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
      top:top_pair_id ( team_name ),
      bottom:bottom_pair_id ( team_name )
    `)
    .eq("tournament_id", tournamentId)
    .order("position_no", { ascending: true });

  const { data: hoyosRaw } = await db
    .from("matchplay_hole_results")
    .select("match_id, hole_no, top_points, bottom_points")
    .in("match_id", (matchesRaw ?? []).map((m: any) => m.id))
    .order("hole_no", { ascending: true });

  const hoyosPorMatch = new Map<string, RyderMatch["hoyos"]>();
  for (const h of hoyosRaw ?? []) {
    const arr = hoyosPorMatch.get((h as any).match_id) ?? [];
    arr.push({
      hole_no: (h as any).hole_no,
      arriba: Number((h as any).top_points ?? 0),
      abajo: Number((h as any).bottom_points ?? 0),
    });
    hoyosPorMatch.set((h as any).match_id, arr);
  }

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
      .map((s: any) => ({
        session_id: s.id,
        session_no: s.session_no,
        nombre: s.name,
        scoring_format: s.scoring_format,
        handicap_allowance_pct:
          s.handicap_allowance_pct === null ? null : Number(s.handicap_allowance_pct),
        start_mode: s.start_mode,
        start_tees: s.start_tees ?? null,
        puntos_por_partido: Number(s.points_per_match ?? 1),
        partidos_esperados: s.match_count ?? null,
        matches: (matchesRaw ?? [])
          .filter((m: any) => m.session_id === s.id)
          .map((m: any) => {
            const hoyos = hoyosPorMatch.get(m.id) ?? [];
            const acum = hoyos.reduce(
              (a, h) => ({ arriba: a.arriba + h.arriba, abajo: a.abajo + h.abajo }),
              { arriba: 0, abajo: 0 }
            );
            const cerrado = m.points_top !== null;
            const est = resolverEstado(
              hoyos,
              s.scoring_format,
              18,
              cerrado,
              Boolean(m.is_halved)
            );
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
              puntos_arriba: m.points_top === null ? null : Number(m.points_top),
              puntos_abajo: m.points_bottom === null ? null : Number(m.points_bottom),
              is_halved: Boolean(m.is_halved),
              marcador:
                s.scoring_format === "low_high" && hoyos.length
                  ? `${acum.arriba}-${acum.abajo}`
                  : null,
              hoyos,
              thru: hoyos.length,
              estado: est.estado,
              ventaja: est.ventaja,
              tee_time: m.scheduled_at ?? null,
              starting_hole: s.start_tees?.[0] ?? null,
            } as RyderMatch;
          }),
      }));

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
