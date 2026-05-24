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

function teamShortName(t: MatchPlayTeamRow): string {
  if (t.team_name) return t.team_name;
  if (t.player_a) return formatPlayerName(t.player_a.player);
  return "(equipo)";
}

function teamSubLine(t: MatchPlayTeamRow): string {
  const a = t.player_a ? formatPlayerName(t.player_a.player) : null;
  const b = t.player_b ? formatPlayerName(t.player_b.player) : null;
  if (a && b) return `${a} · ${b}`;
  return a ?? "";
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

  // Slots por seed → team id (si ya hay equipo en ese seed por subasta)
  const teamBySeed = useMemo(() => {
    const map = new Map<number, MatchPlayTeamRow>();
    seededTeams.forEach((t, i) => {
      // Sólo asignamos seed cuando ya tiene postura (orden de subasta definido)
      if (t.auction_order != null) {
        map.set(i + 1, t.team);
      }
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

  const totalActive = seededTeams.length;
  const awardedCount = seededTeams.filter((t) => t.auction_order != null).length;
  const totalRaised = seededTeams.reduce(
    (acc, t) => acc + (t.auction_bid ?? 0),
    0
  );
  const pot = potPercent != null ? (totalRaised * potPercent) / 100 : totalRaised;

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
            label="Adjudicados"
            value={`${awardedCount} / ${targetSize}`}
            tone="ok"
          />
          <Stat label="Activos" value={String(totalActive)} />
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
              items.push(
                <BracketMatchCell
                  key={`m-${r}-${i}`}
                  round={r}
                  positionIdx={i}
                  span={span}
                  rowStart={gridRowStart}
                  roundCount={roundCount}
                  targetSize={targetSize}
                  seedOrder={seedOrder}
                  teamBySeed={teamBySeed}
                  teamById={teamById}
                  matchByPos={matchByPos}
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
  targetSize,
  seedOrder,
  teamBySeed,
  teamById,
  matchByPos,
  currency,
}: {
  round: number;
  positionIdx: number;
  span: number;
  rowStart: number;
  roundCount: number;
  targetSize: number;
  seedOrder: number[];
  teamBySeed: Map<number, MatchPlayTeamRow>;
  teamById: Map<string, MatchPlayTeamRow>;
  matchByPos: Map<string, { top_pair_id: string | null; bottom_pair_id: string | null; winner_pair_id: string | null; status: string | null; result_text: string | null }>;
  currency: string;
}) {
  // Para ronda 1, leemos seeds según seedOrder
  let topTeam: MatchPlayTeamRow | null = null;
  let bottomTeam: MatchPlayTeamRow | null = null;
  let topSeed: number | null = null;
  let bottomSeed: number | null = null;

  if (round === 1) {
    topSeed = seedOrder[positionIdx * 2] ?? null;
    bottomSeed = seedOrder[positionIdx * 2 + 1] ?? null;
    topTeam = topSeed != null ? teamBySeed.get(topSeed) ?? null : null;
    bottomTeam = bottomSeed != null ? teamBySeed.get(bottomSeed) ?? null : null;
  }

  // Match real (cuando ya hay matchplay_matches en BD)
  const realMatch = matchByPos.get(`${round}-${positionIdx + 1}`) ?? null;
  if (realMatch) {
    if (realMatch.top_pair_id) {
      topTeam = teamById.get(realMatch.top_pair_id) ?? topTeam;
    }
    if (realMatch.bottom_pair_id) {
      bottomTeam = teamById.get(realMatch.bottom_pair_id) ?? bottomTeam;
    }
  }

  const winnerId = realMatch?.winner_pair_id ?? null;
  const isFinal = round === roundCount;

  return (
    <div
      className={`relative ${
        isFinal
          ? "rounded-2xl border-2 border-amber-400/60 bg-gradient-to-br from-amber-950/40 to-[#0c1728] p-3 shadow-[0_0_30px_-10px_rgba(251,191,36,0.4)]"
          : "rounded-xl border border-white/10 bg-[#0c1728] p-2"
      } flex flex-col justify-center`}
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
        showBid={round === 1}
        currency={currency}
      />
      <div className="my-1 text-center text-[9px] uppercase tracking-wider text-slate-600">
        vs
      </div>
      <SidePill
        side="bottom"
        seed={bottomSeed}
        team={bottomTeam}
        isWinner={!!winnerId && bottomTeam?.id === winnerId}
        showBid={round === 1}
        currency={currency}
      />
      {realMatch?.result_text ? (
        <p className="mt-1 text-center text-[10px] font-bold text-emerald-300">
          {realMatch.result_text}
        </p>
      ) : null}
      {realMatch?.status === "in_progress" ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-wider text-cyan-400/80">
          ● en juego
        </p>
      ) : null}
      {!realMatch && round === 1 && !topTeam && !bottomTeam ? (
        <p className="mt-1 text-center text-[9px] text-slate-600">
          (esperando subasta)
        </p>
      ) : null}
      {isFinal ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-[0.2em] text-amber-300/90">
          🏆 Final
        </p>
      ) : null}
      <p className="mt-1 text-center text-[8px] text-slate-600">
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
  showBid,
  currency,
}: {
  side: "top" | "bottom";
  seed: number | null;
  team: MatchPlayTeamRow | null;
  isWinner: boolean;
  showBid: boolean;
  currency: string;
}) {
  const tone = isWinner
    ? "bg-emerald-900/60 border-emerald-400/60"
    : team
      ? "bg-white/5 border-white/10"
      : "bg-black/30 border-white/5";
  return (
    <div
      className={`rounded-lg border px-2 py-1 ${tone}`}
      data-side={side}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-flex h-5 w-7 shrink-0 items-center justify-center rounded text-[10px] font-bold ${
            seed != null
              ? "bg-cyan-500/20 text-cyan-200"
              : "bg-slate-700/40 text-slate-500"
          }`}
        >
          {seed != null ? `#${seed}` : "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-[12px] font-bold leading-tight ${
              isWinner
                ? "text-emerald-200"
                : team
                  ? "text-white"
                  : "text-slate-600 italic"
            }`}
          >
            {team ? teamShortName(team) : "Por definir"}
          </div>
          {team ? (
            <div className="truncate text-[9px] text-slate-400">
              {teamSubLine(team)}
            </div>
          ) : null}
        </div>
        {showBid && team?.auction_bid != null ? (
          <span className="ml-auto shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200">
            {money(team.auction_bid, currency)}
          </span>
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
