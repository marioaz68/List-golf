"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import type { MatchPlayEntryRow, MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import {
  bracketCapacity,
  bracketSeedOrder,
  roundCountForBracketSize,
  roundLabel,
} from "@/lib/matchplay/bracketUtils";
import { sortTeamsForSeeding } from "@/lib/matchplay/sortTeamsForSeeding";

type ExistingMatch = {
  id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string | null;
  result_text: string | null;
};

type PrizeShareRow = {
  position: number;
  label: string;
  percent: number;
  source?: "match_play" | "consolation_match_play" | "stroke_play_aggregate";
};

export type TeeSetLite = {
  id: string;
  name: string;
  code: string | null;
  color: string | null;
  tee_color: string | null;
};

export type TeeRuleLite = {
  id: string;
  category_id: string;
  tee_set_id: string;
  priority: number;
  age_min: number | null;
  age_max: number | null;
  gender: "M" | "F" | "X" | null;
  handicap_min: number | null;
  handicap_max: number | null;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
  existingMatches: ExistingMatch[];
  bracketMainPairs: number | null;
  currency: string;
  potPercent: number | null;
  prizeShares: PrizeShareRow[];
  teeSets?: TeeSetLite[];
  teeRules?: TeeRuleLite[];
  birthYearByPlayerId?: Record<string, number | null>;
};

function money(v: number | null | undefined, currency: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("es-MX")} ${currency}`;
}

/** Nombre compacto para móvil: solo primer nombre + primer apellido.
 *  Ej.: "Leticia Sosa Rodriguez" → "Leticia Sosa". */
function formatPlayerNameCompact(p: {
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const first = (p.first_name ?? "").trim().split(/\s+/)[0] ?? "";
  const last = (p.last_name ?? "").trim().split(/\s+/)[0] ?? "";
  return `${first} ${last}`.trim() || "—";
}

type DisplayPlayer = {
  label: string;
  gender: "M" | "F" | "X";
  tee: TeeSetLite | null;
};

/** Devuelve [hombre, mujer] cuando es posible; si no, conserva el orden A,B.
 *  Incluye el tee asignado por las reglas. */
function playersOrderedMaleFirst(
  t: MatchPlayTeamRow,
  compact: boolean,
  teeRules: TeeRuleLite[],
  teeSets: TeeSetLite[],
  birthYearByPlayerId: Record<string, number | null>
): DisplayPlayer[] {
  const fmt = compact ? formatPlayerNameCompact : formatPlayerName;
  const list: DisplayPlayer[] = [];
  const push = (entry: MatchPlayEntryRow | null) => {
    if (!entry) return;
    const tee = resolveTeeForPlayer(
      {
        id: entry.player.id,
        gender: entry.player.gender,
        handicap_index: entry.handicap_index ?? entry.effective_hi ?? null,
        category_id: entry.category_id ?? null,
      },
      teeRules,
      teeSets,
      birthYearByPlayerId[entry.player.id] ?? null
    );
    list.push({
      label: fmt(entry.player),
      gender: (entry.player.gender ?? "X") as "M" | "F" | "X",
      tee,
    });
  };
  push(t.player_a);
  push(t.player_b);
  list.sort((a, b) => {
    const order: Record<"M" | "F" | "X", number> = { M: 0, F: 1, X: 2 };
    return order[a.gender] - order[b.gender];
  });
  return list;
}

/** Devuelve el tee set asignado a un jugador según las reglas y datos del jugador.
 *  Retorna null si no hay match (o no hay reglas). */
function resolveTeeForPlayer(
  player: {
    id: string;
    gender: "M" | "F" | "X" | null;
    handicap_index: number | null;
    category_id: string | null;
  },
  rules: TeeRuleLite[],
  teeSets: TeeSetLite[],
  birthYear: number | null
): TeeSetLite | null {
  if (!player.category_id) return null;
  const age =
    birthYear != null && birthYear > 0
      ? new Date().getFullYear() - birthYear
      : null;
  const hi = player.handicap_index ?? null;
  const candidates = rules
    .filter((r) => r.category_id === player.category_id)
    .sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999));
  for (const r of candidates) {
    if (r.gender && r.gender !== player.gender) continue;
    if (r.age_min != null && (age == null || age < r.age_min)) continue;
    if (r.age_max != null && (age == null || age > r.age_max)) continue;
    if (r.handicap_min != null && (hi == null || hi < r.handicap_min)) continue;
    if (r.handicap_max != null && (hi == null || hi > r.handicap_max)) continue;
    const tee = teeSets.find((t) => t.id === r.tee_set_id);
    if (tee) return tee;
  }
  return null;
}

export default function LiveBracketView({
  tournamentId,
  tournamentName,
  teams: initialTeams,
  existingMatches: initialMatches,
  bracketMainPairs,
  currency,
  potPercent,
  prizeShares,
  teeSets = [],
  teeRules = [],
  birthYearByPlayerId = {},
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);

  // Detección reactiva de móvil para usar nombres compactos.
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Escalado visual real con CSS transform (no reflowea texto: solo encoge).
  // 0.55 por defecto en móvil para que quepa el cuadro completo de un vistazo.
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (mobile) setZoom(0.55);
  }, []);
  const stepZoom = useCallback((delta: number) => {
    setZoom((z) => {
      const next = Math.round((z + delta) * 100) / 100;
      return Math.min(1.8, Math.max(0.3, next));
    });
  }, []);

  // Medimos las dimensiones reales del bracket para que el contenedor de scroll
  // refleje el tamaño escalado (transform: scale() no afecta el layout box).
  const bracketRef = useRef<HTMLDivElement>(null);
  const [bracketSize, setBracketSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!bracketRef.current) return;
    const el = bracketRef.current;
    const measure = () => {
      setBracketSize({ w: el.scrollWidth, h: el.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Realtime para matches reales (cuando el cuadro ya está publicado)
  const [matches, setMatches] = useState<ExistingMatch[]>(initialMatches);
  useEffect(() => setMatches(initialMatches), [initialMatches]);

  useEffect(() => {
    if (!tournamentId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`mp-public-matches-${tournamentId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "matchplay_matches",
        },
        () => {
          // Refetch matches via REST when anything changes.
          supabase
            .from("matchplay_matches")
            .select(
              "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text, bracket:matchplay_brackets!inner(tournament_id)"
            )
            .eq("bracket.tournament_id", tournamentId)
            .then(({ data }) => {
              if (!data) return;
              setMatches(
                data.map((m) => ({
                  id: m.id,
                  round_no: m.round_no,
                  position_no: m.position_no,
                  top_pair_id: m.top_pair_id,
                  bottom_pair_id: m.bottom_pair_id,
                  winner_pair_id: m.winner_pair_id,
                  status: m.status,
                  result_text: m.result_text,
                }))
              );
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tournamentId]);

  // Equipos vivos ordenados por subasta (postura desc, orden asc)
  const seededTeams = useMemo(() => {
    const active = teams.filter((t) => t.is_active);
    return sortTeamsForSeeding(active, "auction").map((t) => ({
      ...t,
      team: active.find((x) => x.id === t.id)!,
    }));
  }, [teams]);

  const teamById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );

  // Tamaño objetivo del cuadro: usar bracket_main_pairs si está, si no, capacidad mínima >= equipos activos
  const targetSize = useMemo(() => {
    if (bracketMainPairs && bracketMainPairs >= 2) {
      // Asegurar potencia de 2
      let p = 2;
      while (p < bracketMainPairs) p *= 2;
      return p;
    }
    return bracketCapacity(Math.max(seededTeams.length, 2), 64);
  }, [bracketMainPairs, seededTeams.length]);

  const roundCount = roundCountForBracketSize(targetSize);
  const seedOrder = useMemo(() => bracketSeedOrder(targetSize), [targetSize]);

  // Total inscritos (define cuántos slots del cuadro NUNCA se llenarán = BYE).
  // Esto es independiente de cuántos ya se hayan adjudicado en subasta.
  const totalInscribed = useMemo(
    () => seededTeams.length,
    [seededTeams.length]
  );

  // Slots por seed → team id.
  // SOLO equipos ya ADJUDICADOS en la subasta ocupan un slot. Los demás
  // (seeds ≤ totalInscribed pero aún sin postura) se muestran como
  // "Por adjudicar"; los seeds > totalInscribed se muestran como vacantes
  // (BYE para su oponente).
  const teamBySeed = useMemo(() => {
    const map = new Map<number, MatchPlayTeamRow>();
    const auctioned = seededTeams.filter((t) => t.auction_order != null);
    auctioned.forEach((t, i) => {
      map.set(i + 1, t.team);
    });
    return map;
  }, [seededTeams]);

  // Existencia de matches reales por (round, position) cuando bracket publicado
  const matchByPos = useMemo(() => {
    const map = new Map<string, ExistingMatch>();
    for (const m of matches) {
      map.set(`${m.round_no}-${m.position_no}`, m);
    }
    return map;
  }, [matches]);

  // Slots calculados por (round, position) con cascada de BYE:
  // - Ronda 1: leemos seeds del seedOrder; el slot puede ser un equipo o null.
  // - Si en un match solo hay un equipo (faltó el otro), ese equipo gana por BYE
  //   y sube como ganador a la siguiente ronda automáticamente.
  // - Si ya hay match real publicado en BD, esos datos mandan (incluye winner_pair_id).
  const slotsByRound = useMemo(() => {
    type Slot = {
      top: MatchPlayTeamRow | null;
      bottom: MatchPlayTeamRow | null;
      topSeed: number | null;
      bottomSeed: number | null;
      topVacant: boolean; // seed > totalInscribed → nunca se llenará
      bottomVacant: boolean;
      winner: MatchPlayTeamRow | null;
      byeSide: "top" | "bottom" | null;
    };
    const rounds: Array<Map<number, Slot>> = [];

    // Ronda 1.
    // Vacancia se determina por totalInscribed (no por equipos adjudicados):
    // - Si el seed > totalInscribed → esa posición NUNCA se llenará → BYE para el
    //   oponente.
    // - Si el seed ≤ totalInscribed pero aún no adjudicado → "por adjudicar".
    const r1 = new Map<number, Slot>();
    const r1Count = targetSize / 2;
    for (let p = 0; p < r1Count; p++) {
      const tSeed = seedOrder[p * 2] ?? null;
      const bSeed = seedOrder[p * 2 + 1] ?? null;
      const topVacant = tSeed != null && tSeed > totalInscribed;
      const bottomVacant = bSeed != null && bSeed > totalInscribed;
      let top =
        !topVacant && tSeed != null ? teamBySeed.get(tSeed) ?? null : null;
      let bottom =
        !bottomVacant && bSeed != null ? teamBySeed.get(bSeed) ?? null : null;
      const real = matchByPos.get(`1-${p + 1}`);
      if (real) {
        if (real.top_pair_id) top = teamById.get(real.top_pair_id) ?? top;
        if (real.bottom_pair_id)
          bottom = teamById.get(real.bottom_pair_id) ?? bottom;
      }
      // BYE: si la posición es VACANTE (basado en totalInscribed) → el otro lado
      // pasa por BYE (aunque aún no esté adjudicado). El "ganador" del BYE solo
      // existe si el lado ocupado ya tiene equipo.
      let winner: MatchPlayTeamRow | null = null;
      let byeSide: "top" | "bottom" | null = null;
      if (real?.winner_pair_id) {
        winner = teamById.get(real.winner_pair_id) ?? null;
      } else if (topVacant && !bottomVacant) {
        byeSide = "top";
        if (bottom) winner = bottom;
      } else if (bottomVacant && !topVacant) {
        byeSide = "bottom";
        if (top) winner = top;
      } else if (top && !bottom && !bottomVacant) {
        // Edge: ambos seeds ≤ totalInscribed pero solo uno adjudicado → NO es
        // BYE; espera el otro adjudicado.
      } else if (!top && bottom && !topVacant) {
        // Edge: igual al anterior pero invertido.
      }
      r1.set(p, {
        top,
        bottom,
        topSeed: tSeed,
        bottomSeed: bSeed,
        topVacant,
        bottomVacant,
        winner,
        byeSide,
      });
    }
    rounds.push(r1);

    // Rondas r >= 2: ganador(r-1, 2p) vs ganador(r-1, 2p+1).
    // IMPORTANTE: a partir de R2 NO hay BYE automático. Si un slot llega vacío,
    // simplemente queda en "esperando ganador" hasta que se juegue/avance el
    // match correspondiente. Esto cumple la regla: BYE solo en R1.
    for (let r = 2; r <= roundCount; r++) {
      const prev = rounds[r - 2];
      const cur = new Map<number, Slot>();
      const count = targetSize / Math.pow(2, r);
      for (let p = 0; p < count; p++) {
        const upMatch = prev.get(p * 2);
        const dnMatch = prev.get(p * 2 + 1);
        let top: MatchPlayTeamRow | null = upMatch?.winner ?? null;
        let bottom: MatchPlayTeamRow | null = dnMatch?.winner ?? null;
        const real = matchByPos.get(`${r}-${p + 1}`);
        if (real) {
          if (real.top_pair_id) top = teamById.get(real.top_pair_id) ?? top;
          if (real.bottom_pair_id)
            bottom = teamById.get(real.bottom_pair_id) ?? bottom;
        }
        // Solo el winner viene de la BD; nada de BYE automático en R2+.
        const winner = real?.winner_pair_id
          ? teamById.get(real.winner_pair_id) ?? null
          : null;
        cur.set(p, {
          top,
          bottom,
          topSeed: null,
          bottomSeed: null,
          topVacant: false,
          bottomVacant: false,
          winner,
          byeSide: null,
        });
      }
      rounds.push(cur);
    }
    return rounds;
  }, [
    seedOrder,
    teamBySeed,
    teamById,
    matchByPos,
    targetSize,
    roundCount,
    totalInscribed,
  ]);

  const totalActive = totalInscribed;
  const awardedCount = seededTeams.filter((t) => t.auction_order != null).length;
  const totalRaised = seededTeams.reduce(
    (acc, t) => acc + (t.auction_bid ?? 0),
    0
  );
  const pot = potPercent != null ? (totalRaised * potPercent) / 100 : totalRaised;
  // R1: cada slot VACANTE (seed > totalInscritos) manda BYE al oponente.
  // Con N inscritos en cuadro S, hay (S - N) BYEs y (N - (S - N))/2 = N - S/2
  // matches reales en R1.
  const byesR1 = Math.max(0, targetSize - totalInscribed);
  const realMatchesR1 = Math.max(
    0,
    Math.floor((totalInscribed - byesR1) / 2)
  );

  // Render: cada ronda como columna; cada match con grid-row span 2^k
  return (
    <div className="space-y-3">
      {/* HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-[#0c1728] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">
            Cuadro en vivo · armado por subasta
          </div>
          <h1 className="mt-1 truncate text-xl font-extrabold text-white sm:text-2xl">
            {tournamentName}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Stat
            label={`Cuadro ${targetSize}`}
            value={`${totalActive} parejas`}
            tone="ok"
          />
          <Stat
            label="R1 matches"
            value={String(realMatchesR1)}
            tone="ok"
          />
          <Stat label="R1 BYEs" value={String(byesR1)} tone="warn" />
          <Stat
            label="Adjudicados"
            value={`${awardedCount} / ${totalActive}`}
          />
          <Stat label="Subastado" value={money(totalRaised, currency)} tone="ok" />
          <Stat
            label={`Bolsa (${potPercent ?? 100}%)`}
            value={money(pot, currency)}
            tone="amber"
          />
        </div>
      </header>

      {/* CONTROL DE ZOOM + GUÍA PELLIZCO */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cyan-500/20 bg-[#0c1728] px-3 py-2">
        <div className="flex items-center gap-2 text-[12px] text-slate-300">
          <span className="text-xl leading-none" aria-hidden>
            🤏
          </span>
          <span>
            <span className="hidden sm:inline">
              Pellizca para hacer zoom o usa los botones.
            </span>
            <span className="sm:hidden">Pellizca o usa botones →</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-[12px]">
          <button
            type="button"
            onClick={() => stepZoom(-0.1)}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-bold text-white hover:bg-white/10 active:bg-white/15"
            aria-label="Alejar"
          >
            −
          </button>
          <span className="w-14 text-center text-[11px] font-bold text-cyan-200">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => stepZoom(0.1)}
            className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 font-bold text-white hover:bg-white/10 active:bg-white/15"
            aria-label="Acercar"
          >
            +
          </button>
          <button
            type="button"
            onClick={() => setZoom(1)}
            className="ml-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/20"
          >
            100%
          </button>
        </div>
      </div>

      {/* LEYENDA DE COLORES (2 colores: arriba / abajo) */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-cyan-400" />
          Cuadro superior
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-violet-400" />
          Cuadro inferior
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-amber-400" />
          Final
        </span>
      </div>

      {/* BRACKET (con transform scale: encoge VISUALMENTE sin reflowear texto) */}
      <div className="overflow-auto pb-3">
        <div
          className="mx-auto"
          style={{
            width: bracketSize.w ? bracketSize.w * zoom : undefined,
            height: bracketSize.h ? bracketSize.h * zoom : undefined,
          }}
        >
          <div
            ref={bracketRef}
            className="relative mx-auto grid min-w-max gap-x-6"
            style={{
              gridTemplateColumns: `repeat(${roundCount}, minmax(220px, 260px))`,
              gridTemplateRows: `auto repeat(${targetSize}, minmax(28px, auto))`,
              transform: `scale(${zoom})`,
              transformOrigin: "top left",
            }}
          >
            {/* Cabeceras: solo texto, sin caja */}
            {Array.from({ length: roundCount }, (_, ri) => {
              const r = ri + 1;
              return (
                <div
                  key={`hdr-${r}`}
                  className="sticky top-0 z-10 pb-1 text-center text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300/80"
                  style={{ gridColumn: r, gridRow: "1 / span 1" }}
                >
                  {roundLabel(r, roundCount, targetSize)}
                </div>
              );
            })}

            {/* DIVISOR fino entre cuadro superior e inferior */}
            <div
              className="pointer-events-none self-end"
              style={{
                gridColumn: `1 / span ${roundCount}`,
                gridRow: `${targetSize / 2 + 1} / span 1`,
                zIndex: 5,
              }}
            >
              <div className="h-px w-full bg-gradient-to-r from-cyan-400/50 via-amber-400/40 to-violet-400/50" />
            </div>

            {/* Matches */}
            {Array.from({ length: roundCount }, (_, ri) => {
              const r = ri + 1;
              const span = Math.pow(2, r);
              const matchesInRound = targetSize / span;
              const items: React.ReactNode[] = [];
              for (let i = 0; i < matchesInRound; i++) {
                const gridRowStart = span * i + 2;
                const slot = slotsByRound[r - 1]?.get(i);
                const real = matchByPos.get(`${r}-${i + 1}`) ?? null;
                // Mitad superior: positionIdx en la primera mitad de los
                // matches de esa ronda. La final (matchesInRound === 1) se
                // considera "ninguno".
                const half: "top" | "bottom" | "final" =
                  matchesInRound === 1
                    ? "final"
                    : i < matchesInRound / 2
                      ? "top"
                      : "bottom";
                items.push(
                  <BracketMatchCell
                    key={`m-${r}-${i}`}
                    round={r}
                    positionIdx={i}
                    span={span}
                    rowStart={gridRowStart}
                    roundCount={roundCount}
                    half={half}
                    topTeam={slot?.top ?? null}
                    bottomTeam={slot?.bottom ?? null}
                    topSeed={slot?.topSeed ?? null}
                    bottomSeed={slot?.bottomSeed ?? null}
                    topVacant={slot?.topVacant ?? false}
                    bottomVacant={slot?.bottomVacant ?? false}
                    byeSide={slot?.byeSide ?? null}
                    computedWinnerId={slot?.winner?.id ?? null}
                    realMatch={real}
                    currency={currency}
                    compactNames={isMobile}
                    teeRules={teeRules}
                    teeSets={teeSets}
                    birthYearByPlayerId={birthYearByPlayerId}
                  />
                );
              }
              return items;
            })}
          </div>
        </div>
      </div>

      {/* PIE: leyenda + distribución bolsa */}
      <footer className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-xl border border-white/10 bg-[#0c1728] p-3 text-[12px] text-slate-300">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            Cómo se arma el cuadro
          </h2>
          <ul className="mt-2 space-y-1">
            <li>
              <span className="font-bold text-amber-200">1.</span> Solo entran
              al cuadro las parejas <strong>YA ADJUDICADAS</strong> en subasta
              (mayor postura → mejor seed; en empate, la subastada primero).
            </li>
            <li>
              <span className="font-bold text-amber-200">2.</span> Cuadro de{" "}
              {targetSize} (
              <code className="text-cyan-300">1 vs {targetSize}</code>,{" "}
              <code className="text-cyan-300">
                {Math.floor(targetSize / 2)} vs{" "}
                {Math.floor(targetSize / 2) + 1}
              </code>
              , …).
            </li>
            <li>
              <span className="font-bold text-amber-200">3.</span> Con{" "}
              <strong className="text-cyan-200">{totalInscribed}</strong>{" "}
              inscritos en cuadro de {targetSize}, hay{" "}
              <strong className="text-amber-200">{byesR1}</strong> slots
              vacantes → <strong>{byesR1} BYEs</strong> pre-definidos en R1 y{" "}
              <strong>{realMatchesR1}</strong> matches reales.
            </li>
            <li>
              <span className="font-bold text-amber-200">4.</span> Slots:{" "}
              <span className="text-white">equipo</span> = adjudicado ·{" "}
              <span className="text-cyan-200/70 italic">Por adjudicar</span> =
              seed inscrito sin postura aún ·{" "}
              <span className="text-slate-500 uppercase">BYE · vacante</span> =
              seed que nunca se llena (cuadro mayor a inscritos).
            </li>
            <li>
              <span className="font-bold text-amber-200">5.</span>{" "}
              <strong>BYE solo en R1.</strong> A partir de R2 nadie pasa por
              BYE: los ganadores de R1 se enfrentan entre sí.
            </li>
            <li>
              <span className="font-bold text-amber-200">6.</span> Las
              posiciones se reordenan en tiempo real conforme avanza la
              subasta (nueva postura más alta → sube de seed).
            </li>
          </ul>
        </section>

        {prizeShares.length > 0 ? (
          <PrizeBreakdown
            prizeShares={prizeShares}
            pot={pot}
            currency={currency}
          />
        ) : null}
      </footer>

      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-slate-500">
        <Link
          href={`/torneos/${tournamentId}/matches-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          📺 Matches en vivo
        </Link>
        <Link
          href={`/torneos/${tournamentId}`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          ← Página del torneo
        </Link>
      </div>
    </div>
  );
}

function BracketMatchCell({
  round,
  positionIdx,
  span,
  rowStart,
  roundCount,
  half,
  topTeam,
  bottomTeam,
  topSeed,
  bottomSeed,
  topVacant,
  bottomVacant,
  byeSide,
  computedWinnerId,
  realMatch,
  currency,
  compactNames,
  teeRules,
  teeSets,
  birthYearByPlayerId,
}: {
  round: number;
  positionIdx: number;
  span: number;
  rowStart: number;
  roundCount: number;
  half: "top" | "bottom" | "final";
  topTeam: MatchPlayTeamRow | null;
  bottomTeam: MatchPlayTeamRow | null;
  topSeed: number | null;
  bottomSeed: number | null;
  topVacant: boolean;
  bottomVacant: boolean;
  byeSide: "top" | "bottom" | null;
  computedWinnerId: string | null;
  realMatch: {
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: string | null;
    result_text: string | null;
  } | null;
  currency: string;
  compactNames: boolean;
  teeRules: TeeRuleLite[];
  teeSets: TeeSetLite[];
  birthYearByPlayerId: Record<string, number | null>;
}) {
  const winnerId = realMatch?.winner_pair_id ?? computedWinnerId ?? null;
  const isFinal = round === roundCount;
  const hasBye = byeSide !== null;

  // Cuadro de match: cada par enmarcado, fondo según mitad del bracket.
  const cellBox = hasBye && !realMatch
    ? "border-slate-600/40 bg-slate-900/50"
    : isFinal || half === "final"
      ? "border-amber-400/60 bg-amber-950/30 shadow-[0_0_20px_-8px_rgba(251,191,36,0.45)]"
      : half === "bottom"
        ? "border-violet-400/50 bg-violet-950/35"
        : "border-cyan-400/50 bg-cyan-950/35";

  const isTopOfPair = positionIdx % 2 === 0;
  const lineColor = "bg-slate-300/70";

  return (
    <div
      className="relative flex flex-col justify-center px-2"
      style={{
        gridColumn: round,
        gridRow: `${rowStart} / span ${span}`,
      }}
    >
      {/* Conectores estilo bracket */}
      {!isFinal ? (
        <>
          <span
            className={`pointer-events-none absolute right-0 top-1/2 -mt-px h-0.5 w-3 translate-x-full ${lineColor}`}
            aria-hidden
          />
          {isTopOfPair ? (
            <span
              className={`pointer-events-none absolute right-0 top-1/2 bottom-0 w-0.5 ${lineColor}`}
              aria-hidden
            />
          ) : (
            <span
              className={`pointer-events-none absolute right-0 top-0 h-1/2 w-0.5 ${lineColor}`}
              aria-hidden
            />
          )}
        </>
      ) : null}
      {round > 1 ? (
        <span
          className={`pointer-events-none absolute left-0 top-1/2 -mt-px h-0.5 w-3 -translate-x-full ${lineColor}`}
          aria-hidden
        />
      ) : null}

      <div className={`rounded-lg border-2 ${cellBox} px-2 py-1`}>
        <SidePill
          side="top"
          seed={topSeed}
          team={topTeam}
          isWinner={!!winnerId && topTeam?.id === winnerId}
          isVacant={topVacant}
          isPending={!topVacant && !topTeam && round === 1}
          showBid={round === 1}
          currency={currency}
          compactNames={compactNames}
          teeRules={teeRules}
          teeSets={teeSets}
          birthYearByPlayerId={birthYearByPlayerId}
        />

        <div className="h-0.5 bg-white/25" />

        <SidePill
          side="bottom"
          seed={bottomSeed}
          team={bottomTeam}
          isWinner={!!winnerId && bottomTeam?.id === winnerId}
          isVacant={bottomVacant}
          isPending={!bottomVacant && !bottomTeam && round === 1}
          showBid={round === 1}
          currency={currency}
          compactNames={compactNames}
          teeRules={teeRules}
          teeSets={teeSets}
          birthYearByPlayerId={birthYearByPlayerId}
        />

        {realMatch?.result_text ? (
          <p className="mt-0.5 text-center text-[10px] font-semibold text-emerald-300/90">
            {realMatch.result_text}
          </p>
        ) : null}
        {realMatch?.status === "in_progress" ? (
          <p className="mt-0.5 text-center text-[9px] uppercase tracking-wider text-cyan-300/80">
            ● en juego
          </p>
        ) : null}
        {hasBye && !realMatch ? (
          <p className="mt-0.5 text-center text-[9px] uppercase tracking-wider text-amber-300/80">
            BYE → R2
          </p>
        ) : null}
        {!hasBye && !realMatch && round === 1 && !topTeam && !bottomTeam ? (
          <p className="mt-0.5 text-center text-[9px] text-slate-400/60">
            (esperando subasta)
          </p>
        ) : null}
        {isFinal ? (
          <p className="mt-0.5 text-center text-[9px] uppercase tracking-[0.2em] text-amber-200/90">
            🏆 Final
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SidePill({
  side,
  seed,
  team,
  isWinner,
  isVacant,
  isPending,
  showBid,
  currency,
  compactNames,
  teeRules,
  teeSets,
  birthYearByPlayerId,
}: {
  side: "top" | "bottom";
  seed: number | null;
  team: MatchPlayTeamRow | null;
  isWinner: boolean;
  isVacant: boolean;
  isPending: boolean;
  showBid: boolean;
  currency: string;
  compactNames: boolean;
  teeRules: TeeRuleLite[];
  teeSets: TeeSetLite[];
  birthYearByPlayerId: Record<string, number | null>;
}) {
  const players = team
    ? playersOrderedMaleFirst(team, compactNames, teeRules, teeSets, birthYearByPlayerId)
    : [];

  const textTone = isVacant
    ? "text-slate-500"
    : isPending
      ? "text-cyan-200/60 italic"
      : isWinner
        ? "font-bold text-emerald-300"
        : team
          ? "text-slate-100"
          : "text-slate-500 italic";

  return (
    <div className="flex items-center gap-2 py-1" data-side={side}>
      {seed != null ? (
        <span
          className={`hidden w-7 shrink-0 text-right text-[10px] font-bold tabular-nums sm:inline ${
            isVacant ? "text-slate-600" : "text-cyan-300/70"
          }`}
        >
          #{seed}
        </span>
      ) : null}
      <div className={`min-w-0 flex-1 ${textTone}`}>
        {isVacant ? (
          <span className="text-[11px] uppercase tracking-wider">BYE · vacante</span>
        ) : team ? (
          <ul className="space-y-0.5">
            {players.map((p, i) => (
              <li
                key={`${p.label}-${i}`}
                className="flex items-center gap-1 overflow-hidden text-[12px] leading-tight"
              >
                <span
                  className={`shrink-0 text-[9px] ${
                    p.gender === "F"
                      ? "text-pink-300/80"
                      : p.gender === "M"
                        ? "text-blue-300/80"
                        : "text-slate-400"
                  }`}
                  aria-hidden
                >
                  {p.gender === "F" ? "♀" : p.gender === "M" ? "♂" : "·"}
                </span>
                {p.tee ? (
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{ background: p.tee.color ?? "#9ca3af" }}
                    title={`Sale de: ${p.tee.name}`}
                  />
                ) : null}
                <span className="truncate">{p.label}</span>
              </li>
            ))}
            {players.length === 0 ? (
              <li className="text-[12px] italic text-slate-400">(equipo)</li>
            ) : null}
          </ul>
        ) : isPending ? (
          <span className="text-[11px]">Por adjudicar</span>
        ) : (
          <span className="text-[11px]">Por definir</span>
        )}
      </div>
      {showBid && team && team.auction_bid != null ? (
        <span className="hidden shrink-0 text-[10px] font-semibold text-amber-300/80 sm:inline">
          {money(team.auction_bid, currency)}
        </span>
      ) : null}
    </div>
  );
}

function PrizeBreakdown({
  prizeShares,
  pot,
  currency,
}: {
  prizeShares: PrizeShareRow[];
  pot: number;
  currency: string;
}) {
  const groups: Array<{
    key: "match_play" | "consolation_match_play" | "stroke_play_aggregate";
    title: string;
    tone: string;
    icon: string;
  }> = [
    {
      key: "match_play",
      title: "Match Play (cuadro principal)",
      tone: "border-amber-500/40 bg-amber-950/20",
      icon: "🏆",
    },
    {
      key: "consolation_match_play",
      title: "Consolación Match Play",
      tone: "border-emerald-500/40 bg-emerald-950/20",
      icon: "🎯",
    },
    {
      key: "stroke_play_aggregate",
      title: "Consolación Stroke Play (agregado)",
      tone: "border-sky-500/40 bg-sky-950/20",
      icon: "🎳",
    },
  ];

  const totalPct = prizeShares.reduce((acc, p) => acc + (p.percent ?? 0), 0);
  const totalAmount = (pot * totalPct) / 100;

  return (
    <section className="rounded-xl border border-amber-500/30 bg-[#0c1728] p-3">
      <header className="flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
          Distribución de bolsa proyectada
        </h2>
        <div className="text-[11px] text-slate-400">
          Total repartido:{" "}
          <strong className="text-amber-200">{totalPct}%</strong> ={" "}
          <strong className="text-amber-200">
            {money(totalAmount, currency)}
          </strong>
        </div>
      </header>

      <div className="mt-2 grid gap-2">
        {groups.map((g) => {
          const items = prizeShares.filter(
            (p) => (p.source ?? "match_play") === g.key
          );
          const subtotalPct = items.reduce(
            (acc, p) => acc + (p.percent ?? 0),
            0
          );
          return (
            <div
              key={g.key}
              className={`rounded-lg border ${g.tone} p-2`}
            >
              <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                <span className="flex items-center gap-1.5 text-white">
                  <span aria-hidden>{g.icon}</span>
                  {g.title}
                </span>
                <span className="text-slate-300">
                  {items.length > 0
                    ? `${subtotalPct}% · ${money((pot * subtotalPct) / 100, currency)}`
                    : "Sin asignar"}
                </span>
              </div>
              {items.length > 0 ? (
                <ul className="space-y-0.5">
                  {items
                    .slice()
                    .sort((a, b) => a.position - b.position)
                    .map((p, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-[12px]"
                      >
                        <span className="flex items-center gap-2 text-slate-200">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-white/10 text-[9px] font-bold text-white">
                            {p.position}
                          </span>
                          <span>
                            {p.label}{" "}
                            <span className="text-slate-400">({p.percent}%)</span>
                          </span>
                        </span>
                        <span className="font-bold text-amber-200">
                          {money((pot * p.percent) / 100, currency)}
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-[11px] italic text-slate-500">
                  No hay premio configurado para esta categoría.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "warn" | "amber";
}) {
  const color =
    tone === "warn"
      ? "text-amber-300"
      : tone === "ok"
        ? "text-emerald-300"
        : tone === "amber"
          ? "text-amber-200"
          : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1220] px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
