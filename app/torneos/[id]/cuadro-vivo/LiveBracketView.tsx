"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
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

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
  existingMatches: ExistingMatch[];
  bracketMainPairs: number | null;
  currency: string;
  potPercent: number | null;
  prizeShares: Array<{ position: number; label: string; percent: number }>;
};

function money(v: number | null | undefined, currency: string) {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("es-MX")} ${currency}`;
}

/** Devuelve [hombre, mujer] cuando es posible; si no, conserva el orden A,B. */
function playersOrderedMaleFirst(
  t: MatchPlayTeamRow
): Array<{ label: string; gender: "M" | "F" | "X" }> {
  const list: Array<{ label: string; gender: "M" | "F" | "X" }> = [];
  if (t.player_a) {
    list.push({
      label: formatPlayerName(t.player_a.player),
      gender: (t.player_a.player.gender ?? "X") as "M" | "F" | "X",
    });
  }
  if (t.player_b) {
    list.push({
      label: formatPlayerName(t.player_b.player),
      gender: (t.player_b.player.gender ?? "X") as "M" | "F" | "X",
    });
  }
  // Hombre primero, mujer después; otros casos (X/X) mantienen orden original.
  list.sort((a, b) => {
    const order: Record<"M" | "F" | "X", number> = { M: 0, F: 1, X: 2 };
    return order[a.gender] - order[b.gender];
  });
  return list;
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
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);

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

  // Slots por seed → team id.
  // TODAS las parejas activas ocupan un slot (las adjudicadas con postura
  // van primero por sortTeamsForSeeding('auction'); las pendientes caen al
  // final con seed más alto). Los slots restantes (seeds > #parejas) quedan
  // vacíos y generan BYE automático para el seed contrario en R1.
  const teamBySeed = useMemo(() => {
    const map = new Map<number, MatchPlayTeamRow>();
    seededTeams.forEach((t, i) => {
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
      winner: MatchPlayTeamRow | null;
      byeSide: "top" | "bottom" | null;
    };
    const rounds: Array<Map<number, Slot>> = [];

    // Ronda 1
    const r1 = new Map<number, Slot>();
    const r1Count = targetSize / 2;
    for (let p = 0; p < r1Count; p++) {
      const tSeed = seedOrder[p * 2] ?? null;
      const bSeed = seedOrder[p * 2 + 1] ?? null;
      let top = tSeed != null ? teamBySeed.get(tSeed) ?? null : null;
      let bottom = bSeed != null ? teamBySeed.get(bSeed) ?? null : null;
      // Overlay con match real si existe
      const real = matchByPos.get(`1-${p + 1}`);
      if (real) {
        if (real.top_pair_id) top = teamById.get(real.top_pair_id) ?? top;
        if (real.bottom_pair_id)
          bottom = teamById.get(real.bottom_pair_id) ?? bottom;
      }
      // BYE: si solo hay uno → ese pasa.
      let winner: MatchPlayTeamRow | null = null;
      let byeSide: "top" | "bottom" | null = null;
      if (real?.winner_pair_id) {
        winner = teamById.get(real.winner_pair_id) ?? null;
      } else if (top && !bottom) {
        winner = top;
        byeSide = "bottom";
      } else if (!top && bottom) {
        winner = bottom;
        byeSide = "top";
      }
      r1.set(p, { top, bottom, topSeed: tSeed, bottomSeed: bSeed, winner, byeSide });
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
  ]);

  const totalActive = seededTeams.length;
  const awardedCount = seededTeams.filter((t) => t.auction_order != null).length;
  const totalRaised = seededTeams.reduce(
    (acc, t) => acc + (t.auction_bid ?? 0),
    0
  );
  const pot = potPercent != null ? (totalRaised * potPercent) / 100 : totalRaised;
  // R1: cada slot vacío manda BYE al contrincante. Si N parejas en cuadro de S,
  // hay (S - N) slots vacíos → (S - N) BYEs en R1 → (N - (S - N))/2 = N - S/2
  // matches reales (mínimo 0).
  const byesR1 = Math.max(0, targetSize - totalActive);
  const realMatchesR1 = Math.max(0, Math.floor((totalActive - byesR1) / 2));

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

      {/* BRACKET */}
      <div className="overflow-x-auto pb-3">
        <div
          className="grid min-w-max gap-x-4"
          style={{
            gridTemplateColumns: `repeat(${roundCount}, minmax(220px, 280px))`,
            gridTemplateRows: `repeat(${targetSize}, minmax(34px, auto))`,
          }}
        >
          {/* Cabeceras */}
          {Array.from({ length: roundCount }, (_, ri) => {
            const r = ri + 1;
            return (
              <div
                key={`hdr-${r}`}
                className="sticky top-0 z-10 col-start-auto rounded-t-xl border border-white/10 bg-[#0c1728] px-3 py-2 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300"
                style={{ gridColumn: r, gridRow: "1 / span 1" }}
              >
                {roundLabel(r, roundCount, targetSize)}
              </div>
            );
          })}

          {/* Matches */}
          {Array.from({ length: roundCount }, (_, ri) => {
            const r = ri + 1;
            const span = Math.pow(2, r);
            const matchesInRound = targetSize / span;
            const items: React.ReactNode[] = [];
            for (let i = 0; i < matchesInRound; i++) {
              const gridRowStart = span * i + 2; // +2 para dejar fila 1 a header
              const slot = slotsByRound[r - 1]?.get(i);
              const real = matchByPos.get(`${r}-${i + 1}`) ?? null;
              items.push(
                <BracketMatchCell
                  key={`m-${r}-${i}`}
                  round={r}
                  positionIdx={i}
                  span={span}
                  rowStart={gridRowStart}
                  roundCount={roundCount}
                  topTeam={slot?.top ?? null}
                  bottomTeam={slot?.bottom ?? null}
                  topSeed={slot?.topSeed ?? null}
                  bottomSeed={slot?.bottomSeed ?? null}
                  byeSide={slot?.byeSide ?? null}
                  computedWinnerId={slot?.winner?.id ?? null}
                  realMatch={real}
                  currency={currency}
                />
              );
            }
            return items;
          })}
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
              <span className="font-bold text-amber-200">1.</span> Mayor postura
              → mejor seed.
            </li>
            <li>
              <span className="font-bold text-amber-200">2.</span> En empate,
              prioridad para la pareja con menor # de subasta (la que salió
              primero).
            </li>
            <li>
              <span className="font-bold text-amber-200">3.</span> Cuadro de{" "}
              {targetSize} (
              <code className="text-cyan-300">1 vs {targetSize}</code>,{" "}
              <code className="text-cyan-300">
                {Math.floor(targetSize / 2)} vs{" "}
                {Math.floor(targetSize / 2) + 1}
              </code>
              , …).
            </li>
            <li>
              <span className="font-bold text-amber-200">4.</span> Con{" "}
              <strong className="text-cyan-200">{totalActive}</strong> parejas
              en cuadro de {targetSize}, los mejores{" "}
              <strong className="text-amber-200">{byesR1}</strong> seeds pasan
              por <strong>BYE</strong> en R1 y juegan{" "}
              <strong>{realMatchesR1}</strong> matches reales.
            </li>
            <li>
              <span className="font-bold text-amber-200">5.</span>{" "}
              <strong>BYE solo en R1.</strong> A partir de R2 nadie pasa por
              BYE: los ganadores de R1 se enfrentan entre sí.
            </li>
            <li>
              <span className="font-bold text-amber-200">6.</span> Badge{" "}
              <span className="rounded bg-slate-600/40 px-1 py-0.5 text-[10px] font-bold text-slate-300">
                s/p
              </span>{" "}
              = pareja inscrita sin postura adjudicada todavía (cambia de seed
              conforme avanza la subasta).
            </li>
          </ul>
        </section>

        {prizeShares.length > 0 ? (
          <section className="rounded-xl border border-amber-500/30 bg-[#0c1728] p-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-300">
              Distribución de bolsa proyectada
            </h2>
            <div className="mt-2 grid gap-1">
              {prizeShares.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5 text-[12px]"
                >
                  <span className="text-slate-300">
                    {p.label} ({p.percent}%)
                  </span>
                  <span className="font-bold text-amber-200">
                    {money((pot * p.percent) / 100, currency)}
                  </span>
                </div>
              ))}
            </div>
          </section>
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
  topTeam,
  bottomTeam,
  topSeed,
  bottomSeed,
  byeSide,
  computedWinnerId,
  realMatch,
  currency,
}: {
  round: number;
  positionIdx: number;
  span: number;
  rowStart: number;
  roundCount: number;
  topTeam: MatchPlayTeamRow | null;
  bottomTeam: MatchPlayTeamRow | null;
  topSeed: number | null;
  bottomSeed: number | null;
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
}) {
  const winnerId = realMatch?.winner_pair_id ?? computedWinnerId ?? null;
  const isFinal = round === roundCount;
  const hasBye = byeSide !== null;

  // Fondo distintivo solo en los brackets:
  // - Final: dorado.
  // - BYE: tono pizarra apagado.
  // - Resto: azul-cyan medio con sombra para que resalte sobre la página.
  const cellBg = isFinal
    ? "rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-900/60 via-amber-950/60 to-[#1a1304] p-3 shadow-[0_0_36px_-12px_rgba(251,191,36,0.55)]"
    : hasBye && !realMatch
      ? "rounded-xl border border-slate-500/40 bg-gradient-to-br from-slate-800/70 to-[#0a1220] p-2 shadow-md"
      : "rounded-xl border border-cyan-400/40 bg-gradient-to-br from-cyan-900/45 via-[#0e213c] to-[#0a1424] p-2 shadow-[0_4px_18px_-6px_rgba(8,145,178,0.45)]";

  return (
    <div
      className={`relative flex flex-col justify-center ${cellBg}`}
      style={{
        gridColumn: round,
        gridRow: `${rowStart} / span ${span}`,
      }}
    >
      <SidePill
        side="top"
        seed={topSeed}
        team={topTeam}
        isWinner={!!winnerId && topTeam?.id === winnerId}
        isBye={byeSide === "top"}
        showBid={round === 1}
        currency={currency}
      />
      <div className="my-1 text-center text-[9px] uppercase tracking-wider text-slate-400/70">
        vs
      </div>
      <SidePill
        side="bottom"
        seed={bottomSeed}
        team={bottomTeam}
        isWinner={!!winnerId && bottomTeam?.id === winnerId}
        isBye={byeSide === "bottom"}
        showBid={round === 1}
        currency={currency}
      />

      {realMatch?.result_text ? (
        <p className="mt-1 text-center text-[10px] font-bold text-emerald-300">
          {realMatch.result_text}
        </p>
      ) : null}
      {realMatch?.status === "in_progress" ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-wider text-cyan-300">
          ● en juego
        </p>
      ) : null}
      {hasBye && !realMatch ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-wider text-amber-300">
          Pasa por BYE → espera R2
        </p>
      ) : null}
      {!hasBye && !realMatch && round === 1 && !topTeam && !bottomTeam ? (
        <p className="mt-1 text-center text-[9px] text-slate-400/70">
          (esperando subasta)
        </p>
      ) : null}
      {isFinal ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-[0.2em] text-amber-200">
          🏆 Final
        </p>
      ) : null}
      <p className="mt-1 text-center text-[8px] text-slate-400/60">
        R{round} · M{positionIdx + 1}
      </p>
    </div>
  );
}

function SidePill({
  side,
  seed,
  team,
  isWinner,
  isBye,
  showBid,
  currency,
}: {
  side: "top" | "bottom";
  seed: number | null;
  team: MatchPlayTeamRow | null;
  isWinner: boolean;
  isBye: boolean;
  showBid: boolean;
  currency: string;
}) {
  const tone = isBye
    ? "bg-slate-800/70 border-slate-600/40"
    : isWinner
      ? "bg-emerald-900/70 border-emerald-400/70"
      : team
        ? "bg-[#0b1c34]/80 border-white/15"
        : "bg-black/40 border-white/10";

  const players = team ? playersOrderedMaleFirst(team) : [];

  return (
    <div className={`rounded-lg border px-2 py-1.5 ${tone}`} data-side={side}>
      <div className="flex items-start gap-1.5">
        <span
          className={`mt-0.5 inline-flex h-5 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
            seed != null
              ? "bg-cyan-500/30 text-cyan-100"
              : "bg-slate-700/40 text-slate-400"
          }`}
        >
          {seed != null ? `#${seed}` : "—"}
        </span>
        <div className="min-w-0 flex-1">
          {isBye ? (
            <div className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
              BYE
            </div>
          ) : team ? (
            <ul className="space-y-0.5">
              {players.map((p, i) => (
                <li
                  key={`${p.label}-${i}`}
                  className={`flex items-center gap-1 truncate text-[12px] font-semibold leading-tight ${
                    isWinner ? "text-emerald-100" : "text-white"
                  }`}
                >
                  <span
                    className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm text-[8px] font-bold ${
                      p.gender === "F"
                        ? "bg-pink-500/30 text-pink-200"
                        : p.gender === "M"
                          ? "bg-blue-500/30 text-blue-200"
                          : "bg-slate-500/30 text-slate-200"
                    }`}
                    title={
                      p.gender === "F"
                        ? "Mujer"
                        : p.gender === "M"
                          ? "Hombre"
                          : "Sin género"
                    }
                  >
                    {p.gender === "F" ? "♀" : p.gender === "M" ? "♂" : "·"}
                  </span>
                  <span className="truncate">{p.label}</span>
                </li>
              ))}
              {players.length === 0 ? (
                <li className="text-[12px] italic text-slate-400">(equipo)</li>
              ) : null}
            </ul>
          ) : (
            <div className="text-[12px] italic text-slate-500">Por definir</div>
          )}
        </div>
        {showBid && !isBye && team ? (
          team.auction_bid != null ? (
            <span className="ml-auto shrink-0 rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
              {money(team.auction_bid, currency)}
            </span>
          ) : (
            <span
              className="ml-auto shrink-0 rounded bg-slate-600/40 px-1.5 py-0.5 text-[10px] font-bold text-slate-300"
              title="Pareja inscrita aún sin postura adjudicada"
            >
              s/p
            </span>
          )
        ) : null}
      </div>
    </div>
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
