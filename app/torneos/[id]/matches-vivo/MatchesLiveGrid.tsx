"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import { roundLabel } from "@/lib/matchplay/bracketUtils";
import MatchDetailModal from "./MatchDetailModal";

type MatchRow = {
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

type HoleRow = {
  match_id: string;
  hole_no: number;
  top_points: number | null;
  bottom_points: number | null;
  match_status_after: string | null;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
  initialMatches: MatchRow[];
  initialHoles: HoleRow[];
  bracketId: string | null;
  bracketSize: number;
  roundCount: number;
  holesPerMatch: number;
  /** Cuando los matches vienen de pairing_groups (no del bracket oficial). */
  derivedFromPairings?: boolean;
};

/** Devuelve [hombre, mujer] cuando es posible; mantiene A,B en otros casos. */
function playersOrderedMaleFirst(
  t: MatchPlayTeamRow | null
): Array<{ label: string; gender: "M" | "F" | "X" }> {
  if (!t) return [];
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
  list.sort((a, b) => {
    const order: Record<"M" | "F" | "X", number> = { M: 0, F: 1, X: 2 };
    return order[a.gender] - order[b.gender];
  });
  return list;
}

export default function MatchesLiveGrid({
  tournamentId,
  tournamentName,
  teams: initialTeams,
  initialMatches,
  initialHoles,
  bracketId,
  bracketSize,
  roundCount,
  holesPerMatch,
  derivedFromPairings = false,
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);
  const [matches, setMatches] = useState<MatchRow[]>(initialMatches);
  const [holes, setHoles] = useState<HoleRow[]>(initialHoles);
  const [detail, setDetail] = useState<{
    match: MatchRow;
    topTeam: MatchPlayTeamRow | null;
    bottomTeam: MatchPlayTeamRow | null;
    label: string;
  } | null>(null);

  // Realtime: matches del bracket (sólo si es un bracket oficial real).
  useEffect(() => {
    if (!tournamentId || !bracketId || derivedFromPairings) return;
    const supabase = createClient();
    const ch = supabase
      .channel(`mp-public-mlist-${tournamentId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "matchplay_matches",
          filter: `bracket_id=eq.${bracketId}`,
        },
        () => {
          supabase
            .from("matchplay_matches")
            .select(
              "id, bracket_id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
            )
            .eq("bracket_id", bracketId)
            .then(({ data }) => {
              if (data) setMatches(data as MatchRow[]);
            });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tournamentId, bracketId, derivedFromPairings]);

  // Realtime: hoyos (live scoring) — sólo cuando hay bracket real.
  useEffect(() => {
    if (!tournamentId || !bracketId || derivedFromPairings || matches.length === 0) return;
    const supabase = createClient();
    const matchIds = matches.map((m) => m.id);
    const ch = supabase
      .channel(`mp-public-holes-${tournamentId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "matchplay_hole_results",
        },
        (payload: { eventType: string; new: HoleRow | null; old: { id?: string; match_id?: string } | null }) => {
          const row = (payload.new ?? null) as HoleRow | null;
          if (!row) return;
          if (!matchIds.includes(row.match_id)) return;
          setHoles((prev) => {
            const without = prev.filter(
              (h) => !(h.match_id === row.match_id && h.hole_no === row.hole_no)
            );
            return [...without, row];
          });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [tournamentId, bracketId, matches, derivedFromPairings]);

  // Realtime para matches derivados: cuando se captura/edita stroke play
  // (hole_scores), pedimos al servidor que vuelva a derivar los matches
  // del torneo. Usamos debounce para no recargar en cada hoyo individual.
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tournamentId || !derivedFromPairings) return;
    const supabase = createClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        if (typeof document !== "undefined" && document.hidden) return;
        router.refresh();
      }, 1200);
    };
    const ch = supabase
      .channel(`mp-public-strokes-${tournamentId}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "hole_scores",
        },
        scheduleRefresh
      )
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "round_scores",
        },
        scheduleRefresh
      )
      .subscribe();
    return () => {
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [tournamentId, derivedFromPairings, router]);

  const teamById = useMemo(
    () => new Map(teams.map((t) => [t.id, t])),
    [teams]
  );

  const holesByMatch = useMemo(() => {
    const map = new Map<string, HoleRow[]>();
    for (const h of holes) {
      const list = map.get(h.match_id) ?? [];
      list.push(h);
      map.set(h.match_id, list);
    }
    return map;
  }, [holes]);

  const byRound = useMemo(() => {
    const map = new Map<number, MatchRow[]>();
    for (const m of matches) {
      const list = map.get(m.round_no) ?? [];
      list.push(m);
      map.set(m.round_no, list);
    }
    return Array.from({ length: roundCount }, (_, i) => ({
      roundNo: i + 1,
      label: roundLabel(i + 1, roundCount, bracketSize),
      matches: (map.get(i + 1) ?? []).sort(
        (a, b) => a.position_no - b.position_no
      ),
    }));
  }, [matches, roundCount, bracketSize]);

  const totals = useMemo(() => {
    const total = matches.length;
    const live = matches.filter((m) => m.status === "in_progress").length;
    const done = matches.filter((m) => m.status === "completed").length;
    const pending = matches.filter(
      (m) => m.status === "scheduled" || !m.status
    ).length;
    return { total, live, done, pending };
  }, [matches]);

  if (!bracketId || matches.length === 0) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4 text-white">
        <h1 className="text-xl font-bold">Matches en vivo</h1>
        <div className="rounded border border-amber-400/40 bg-amber-950/40 p-3 text-sm text-amber-100">
          El cuadro todavía no se publica. Cuando se aplique la siembra y se
          genere el bracket, aquí verás todos los partidos en tiempo real.
        </div>
        <Link
          href={`/torneos/${tournamentId}/cuadro-vivo`}
          className="inline-flex items-center rounded border border-white/15 bg-white/5 px-3 py-1.5 text-sm"
        >
          🎯 Ver cuadro en vivo (por subasta)
        </Link>
      </main>
    );
  }

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-cyan-500/30 bg-[#0c1728] px-4 py-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300/80">
            📺 Live scoring · todos los matches
          </div>
          <h1 className="mt-1 truncate text-xl font-extrabold text-white sm:text-2xl">
            {tournamentName}
          </h1>
          {derivedFromPairings ? (
            <p className="mt-1 text-[11px] text-amber-200">
              Matches programados desde las salidas. El cuadro oficial aún no se publica.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <Stat label="Partidos" value={String(totals.total)} />
          <Stat
            label="En juego"
            value={String(totals.live)}
            tone={totals.live > 0 ? "live" : undefined}
          />
          <Stat
            label="Finalizados"
            value={String(totals.done)}
            tone={totals.done > 0 ? "ok" : undefined}
          />
          <Stat label="Pendientes" value={String(totals.pending)} />
        </div>
      </header>

      <div className="space-y-4">
        {byRound.map((round) => (
          <section key={round.roundNo} className="space-y-2">
            <h2 className="rounded-lg border-l-4 border-cyan-400 bg-[#0c1728] px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.18em] text-cyan-200">
              {round.label}
              <span className="ml-2 text-[10px] font-normal text-slate-400">
                ({round.matches.length} partidos)
              </span>
            </h2>
            {round.matches.length === 0 ? (
              <p className="rounded border border-white/10 bg-[#0c1728] p-3 text-[12px] text-slate-500">
                Sin partidos en esta ronda todavía.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {round.matches.map((m) => {
                  const topTeam = m.top_pair_id ? teamById.get(m.top_pair_id) ?? null : null;
                  const bottomTeam = m.bottom_pair_id
                    ? teamById.get(m.bottom_pair_id) ?? null
                    : null;
                  return (
                    <MatchCard
                      key={m.id}
                      match={m}
                      topTeam={topTeam}
                      bottomTeam={bottomTeam}
                      holes={holesByMatch.get(m.id) ?? []}
                      holesPerMatch={holesPerMatch}
                      onOpen={() =>
                        setDetail({
                          match: m,
                          topTeam,
                          bottomTeam,
                          label: round.label,
                        })
                      }
                    />
                  );
                })}
              </div>
            )}
          </section>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 text-[11px]">
        <Link
          href={`/torneos/${tournamentId}/cuadro-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          🎯 Ver cuadro en vivo
        </Link>
        <Link
          href={`/torneos/${tournamentId}?view=bracket`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          Bracket oficial
        </Link>
        <Link
          href={`/torneos/${tournamentId}`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          ← Página del torneo
        </Link>
      </div>

      <MatchDetailModal
        open={!!detail}
        onClose={() => setDetail(null)}
        tournamentId={tournamentId}
        matchId={detail?.match.id ?? null}
        isDerived={
          !!derivedFromPairings ||
          (detail?.match.id?.startsWith("derived-") ?? false)
        }
        topTeam={detail?.topTeam ?? null}
        bottomTeam={detail?.bottomTeam ?? null}
        roundLabel={detail?.label}
        positionNo={detail?.match.position_no ?? 0}
        holesPerMatch={holesPerMatch}
      />
    </div>
  );
}

function MatchCard({
  match,
  topTeam,
  bottomTeam,
  holes,
  holesPerMatch,
  onOpen,
}: {
  match: MatchRow;
  topTeam: MatchPlayTeamRow | null;
  bottomTeam: MatchPlayTeamRow | null;
  holes: HoleRow[];
  holesPerMatch: number;
  onOpen?: () => void;
}) {
  const isBye = match.status === "bye";
  const isDone = match.status === "completed";
  const isScheduled = !isBye && match.status !== "in_progress" && !isDone;

  const topPts = holes.reduce(
    (acc, h) => acc + (h.top_points != null ? Number(h.top_points) : 0),
    0
  );
  const bottomPts = holes.reduce(
    (acc, h) => acc + (h.bottom_points != null ? Number(h.bottom_points) : 0),
    0
  );
  const holesPlayed = holes.filter(
    (h) => h.top_points != null || h.bottom_points != null
  ).length;
  const lastHolePlayed = holes.reduce(
    (m, h) =>
      h.top_points != null || h.bottom_points != null
        ? Math.max(m, h.hole_no)
        : m,
    0
  );
  const nextHole = Math.min(holesPerMatch, lastHolePlayed + 1);
  const topAhead = topPts > bottomPts;
  const bottomAhead = bottomPts > topPts;

  const winnerId = match.winner_pair_id ?? null;
  const topWin = !!winnerId && topTeam?.id === winnerId;
  const bottomWin = !!winnerId && bottomTeam?.id === winnerId;

  // Si hay hoyos capturados (live scoring real o derivado desde tarjetas),
  // mostramos los puntos aunque el match esté en `scheduled` (los derivados
  // siempre vienen así porque aún no hay bracket oficial publicado).
  const hasCapturedHoles = lastHolePlayed > 0;
  const isLive =
    match.status === "in_progress" || (isScheduled && hasCapturedHoles);
  const showZeroForScheduled =
    isScheduled && !hasCapturedHoles && !!topTeam && !!bottomTeam;
  const topPtsDisplay: number | null =
    isLive || isDone || hasCapturedHoles
      ? topPts
      : showZeroForScheduled
        ? 0
        : null;
  const bottomPtsDisplay: number | null =
    isLive || isDone || hasCapturedHoles
      ? bottomPts
      : showZeroForScheduled
        ? 0
        : null;

  const clickable = !!onOpen && !isBye;

  return (
    <article
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onOpen?.();
              }
            }
          : undefined
      }
      className={`rounded-xl border p-3 text-[12px] transition ${
        clickable ? "cursor-pointer hover:border-cyan-400/50 hover:bg-cyan-950/10" : ""
      } ${
        isBye
          ? "border-slate-700/40 bg-slate-900/40 text-slate-500"
          : isDone
            ? "border-emerald-500/30 bg-emerald-950/20"
            : isLive
              ? "border-cyan-400/40 bg-cyan-950/20 shadow-[0_0_24px_-12px_rgba(34,211,238,0.5)]"
              : "border-white/10 bg-[#0c1728]"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1 text-[9px] uppercase tracking-wider">
        <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-400">
          R{match.round_no} · M{match.position_no}
        </span>
        {isLive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 font-bold text-cyan-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            EN JUEGO · va en H{Math.max(lastHolePlayed, 1)}/{holesPerMatch}
          </span>
        ) : isDone ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-200">
            ✓ FINAL · {holesPlayed}/{holesPerMatch} hoyos
          </span>
        ) : isBye ? (
          <span className="rounded-full bg-slate-700/30 px-2 py-0.5 text-slate-400">
            BYE
          </span>
        ) : lastHolePlayed > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 font-bold text-amber-200">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
            Va en H{lastHolePlayed}/{holesPerMatch}
          </span>
        ) : (
          <span className="rounded-full bg-slate-700/30 px-2 py-0.5 text-slate-400">
            Programado · sale H{nextHole}
          </span>
        )}
      </div>

      <Side
        team={topTeam}
        pts={topPtsDisplay}
        isWinner={topWin}
        isAhead={isLive && topAhead}
      />
      <div className="my-0.5 text-center text-[9px] uppercase text-slate-600">
        vs
      </div>
      <Side
        team={bottomTeam}
        pts={bottomPtsDisplay}
        isWinner={bottomWin}
        isAhead={isLive && bottomAhead}
      />

      {match.result_text ? (
        <p className="mt-2 text-center text-[10px] font-bold text-emerald-300">
          {match.result_text}
        </p>
      ) : null}

      {clickable ? (
        <p className="mt-2 text-center text-[10px] text-cyan-300/80">
          Tocar para ver detalle hoyo por hoyo →
        </p>
      ) : null}
    </article>
  );
}

function Side({
  team,
  pts,
  isWinner,
  isAhead,
}: {
  team: MatchPlayTeamRow | null;
  pts: number | null;
  isWinner: boolean;
  isAhead: boolean;
}) {
  const tone = isWinner
    ? "bg-emerald-900/50 border-emerald-400/50"
    : isAhead
      ? "bg-cyan-900/30 border-cyan-400/40"
      : "bg-white/5 border-white/10";
  const players = playersOrderedMaleFirst(team);
  return (
    <div className={`flex items-start gap-2 rounded-md border px-2 py-1.5 ${tone}`}>
      {team?.seed != null ? (
        <span className="mt-0.5 inline-flex h-5 w-7 shrink-0 items-center justify-center rounded bg-cyan-500/20 text-[10px] font-bold text-cyan-200">
          #{team.seed}
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        {team ? (
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
      {pts !== null ? (
        <span
          className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[14px] font-extrabold ${
            isWinner
              ? "bg-emerald-500/30 text-emerald-100"
              : isAhead
                ? "bg-cyan-500/30 text-cyan-100"
                : "bg-white/10 text-slate-200"
          }`}
        >
          {Number.isInteger(pts) ? pts : pts.toFixed(1).replace(/\.0$/, "")}
        </span>
      ) : null}
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
  tone?: "ok" | "live";
}) {
  const color =
    tone === "live"
      ? "text-cyan-300"
      : tone === "ok"
        ? "text-emerald-300"
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
