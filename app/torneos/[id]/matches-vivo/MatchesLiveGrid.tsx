"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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

type MatchScheduleInfo = {
  groupNo: number | null;
  teeTime: string | null;
  groupId: string;
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
  /**
   * Puntos derivados desde `hole_scores` (captura rápida). Activa realtime
   * sobre strokes aunque exista bracket publicado.
   */
  liveFromStrokeScores?: boolean;
  /** Mapa match_id → datos de la salida (group_no, tee_time, group_id). */
  matchSchedule?: Record<string, MatchScheduleInfo>;
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
  liveFromStrokeScores = false,
  matchSchedule = {},
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);
  const [matches, setMatches] = useState<MatchRow[]>(initialMatches);
  const [holes, setHoles] = useState<HoleRow[]>(initialHoles);

  useEffect(() => {
    setMatches(initialMatches);
  }, [initialMatches]);
  useEffect(() => {
    setHoles(initialHoles);
  }, [initialHoles]);

  const strokeLive = derivedFromPairings || liveFromStrokeScores;

  const refreshFromStrokes = useMemo(() => {
    return () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void fetch(
        `/api/matchplay/live-from-strokes?tournament_id=${encodeURIComponent(tournamentId)}`,
        { cache: "no-store" }
      )
        .then((res) => res.json())
        .then((data: { ok?: boolean; matches?: MatchRow[]; holes?: HoleRow[] }) => {
          if (!data.ok) return;
          if (data.matches) setMatches(data.matches);
          if (data.holes) setHoles(data.holes);
        })
        .catch(() => {});
    };
  }, [tournamentId]);
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

  // Realtime: hoyos oficiales en matchplay_hole_results (no captura rápida).
  useEffect(() => {
    if (
      !tournamentId ||
      !bracketId ||
      derivedFromPairings ||
      liveFromStrokeScores ||
      matches.length === 0
    )
      return;
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
  }, [tournamentId, bracketId, matches, derivedFromPairings, liveFromStrokeScores]);

  // Captura rápida → hole_scores. Realtime en hole_scores no siempre está
  // publicado; polling + debounce en cambios cubren el live scoring.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!tournamentId || !strokeLive) return;

    refreshFromStrokes();
    const pollId = setInterval(refreshFromStrokes, 4000);

    const supabase = createClient();
    const scheduleRefresh = () => {
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        refreshFromStrokes();
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
      clearInterval(pollId);
      if (refreshTimerRef.current != null) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
      supabase.removeChannel(ch);
    };
  }, [tournamentId, strokeLive, refreshFromStrokes]);

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

  // Último hoyo capturado por match (para ordenar y detectar retrasos).
  const lastHoleByMatch = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of holes) {
      if (h.top_points == null && h.bottom_points == null) continue;
      if (h.hole_no > holesPerMatch) continue;
      const prev = map.get(h.match_id) ?? 0;
      if (h.hole_no > prev) map.set(h.match_id, h.hole_no);
    }
    return map;
  }, [holes, holesPerMatch]);

  function teeTimeOrder(t: string | null): number {
    if (!t) return Number.POSITIVE_INFINITY;
    const m = t.match(/^(\d{1,2}):(\d{2})/);
    if (!m) return Number.POSITIVE_INFINITY;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  const byRound = useMemo(() => {
    const map = new Map<number, MatchRow[]>();
    for (const m of matches) {
      // Ocultar BYE de la página pública: no es un partido jugado.
      if (m.status === "bye") continue;
      const list = map.get(m.round_no) ?? [];
      list.push(m);
      map.set(m.round_no, list);
    }
    return Array.from({ length: roundCount }, (_, i) => {
      const roundNo = i + 1;
      const list = (map.get(roundNo) ?? []).slice();
      list.sort((a, b) => {
        const sa = matchSchedule[a.id];
        const sb = matchSchedule[b.id];
        const ta = teeTimeOrder(sa?.teeTime ?? null);
        const tb = teeTimeOrder(sb?.teeTime ?? null);
        if (ta !== tb) return ta - tb;
        const ga = sa?.groupNo ?? a.position_no;
        const gb = sb?.groupNo ?? b.position_no;
        if (ga !== gb) return ga - gb;
        return a.position_no - b.position_no;
      });
      // Detección de "retrasados": si existe otro match con salida POSTERIOR
      // que va más adelantado en hoyos capturados, este match va retrasado.
      const behindSet = new Set<string>();
      const decoratedAll = list.map((m) => ({
        id: m.id,
        teeOrder: teeTimeOrder(matchSchedule[m.id]?.teeTime ?? null),
        lastHole: lastHoleByMatch.get(m.id) ?? 0,
        isDone: m.status === "completed",
      }));
      for (const m of decoratedAll) {
        if (m.isDone) continue;
        if (m.teeOrder === Number.POSITIVE_INFINITY) continue;
        const maxAheadHole = decoratedAll
          .filter(
            (other) =>
              other.id !== m.id &&
              other.teeOrder !== Number.POSITIVE_INFINITY &&
              other.teeOrder > m.teeOrder
          )
          .reduce((max, other) => Math.max(max, other.lastHole), 0);
        if (maxAheadHole > m.lastHole) behindSet.add(m.id);
      }
      return {
        roundNo,
        label: roundLabel(roundNo, roundCount, bracketSize),
        matches: list,
        behindSet,
      };
    });
  }, [matches, roundCount, bracketSize, matchSchedule, lastHoleByMatch]);

  // Totales calculados sin BYEs (los BYE no son partidos jugados).
  const totals = useMemo(() => {
    const real = matches.filter((m) => m.status !== "bye");
    const total = real.length;
    const live = real.filter((m) => m.status === "in_progress").length;
    const done = real.filter((m) => m.status === "completed").length;
    const pending = real.filter(
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
                  const sched = matchSchedule[m.id];
                  return (
                    <MatchCard
                      key={m.id}
                      match={m}
                      topTeam={topTeam}
                      bottomTeam={bottomTeam}
                      holes={holesByMatch.get(m.id) ?? []}
                      holesPerMatch={holesPerMatch}
                      teeTime={sched?.teeTime ?? null}
                      groupNo={sched?.groupNo ?? null}
                      behindOnCapture={round.behindSet.has(m.id)}
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
  teeTime,
  groupNo,
  behindOnCapture = false,
  onOpen,
}: {
  match: MatchRow;
  topTeam: MatchPlayTeamRow | null;
  bottomTeam: MatchPlayTeamRow | null;
  holes: HoleRow[];
  holesPerMatch: number;
  teeTime?: string | null;
  groupNo?: number | null;
  behindOnCapture?: boolean;
  onOpen?: () => void;
}) {
  const isBye = match.status === "bye";
  const isDone = match.status === "completed";
  const isScheduled = !isBye && match.status !== "in_progress" && !isDone;

  // Si el match terminó temprano (decidido por marcador), el result_text
  // viene como "5–0 en H14 · 8 puntos por jugar"; lo usamos para mostrar
  // el hoyo de decisión en el badge en lugar de la cuenta de hoyos.
  const decidedAtHole: number | null = (() => {
    if (!isDone || !match.result_text) return null;
    const m = match.result_text.match(/H(\d{1,2})/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n > 0 && n <= holesPerMatch ? n : null;
  })();
  /** Decidido en desempate (muerte súbita). El result_text trae el patrón
   *  "Desempate H{1..9}". */
  const playoffDecidedHole: number | null = (() => {
    if (!isDone || !match.result_text) return null;
    const m = match.result_text.match(/Desempate\s+H(\d)/i);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) && n >= 1 && n <= 9 ? n : null;
  })();

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
  // mostramos el diferencial aunque el match esté en `scheduled` (los
  // derivados siempre vienen así porque aún no hay bracket oficial).
  const hasCapturedHoles = lastHolePlayed > 0;
  const isLive =
    match.status === "in_progress" || (isScheduled && hasCapturedHoles);

  /**
   * Diferencial estilo match play (Bola Baja + Bola Alta). Cada hoyo
   * otorga hasta 2 puntos (1 bola baja + 1 bola alta).
   *
   *   - En juego:        "X UP" / "X DN" / "AS"
   *   - Finalizado:      ganador → "X/Y", perdedor → "X DN".
   *     X = diferencia de puntos con la que ganó.
   *     Y = puntos por jugar al momento de la decisión (hoyos restantes
   *         × 2). Si ganó al 18, Y = 0 → "X/0".
   *
   * Cuando el match está cerrado preferimos los datos parseados de
   * `result_text` y respetamos `winner_pair_id` (no la suma hoyo×hoyo),
   * porque pueden capturarse scores posteriores al cierre que igualan
   * el conteo y harían aparecer "AS" en un match ya ganado.
   */
  function fmtDiff(n: number): string {
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  }
  const showDiffBadge = hasCapturedHoles || isDone;

  const finalDiffFromText: number | null = (() => {
    if (!isDone || !match.result_text) return null;
    const m = match.result_text.match(/(\d+(?:\.\d+)?)\s*arriba/i);
    if (!m) return null;
    const v = Number(m[1]);
    return Number.isFinite(v) && v > 0 ? v : null;
  })();
  const finalPointsLeftFromText: number | null = (() => {
    if (!isDone || !match.result_text) return null;
    const m = match.result_text.match(/(\d+)\s*por jugar/i);
    if (!m) return 0;
    const v = Number(m[1]);
    return Number.isFinite(v) ? v : 0;
  })();

  const liveDiffAbs = Math.abs(topPts - bottomPts);
  const finalDiffAbs = finalDiffFromText ?? liveDiffAbs;
  const finalPointsLeft = finalPointsLeftFromText ?? 0;

  const winnerLabel: string = isDone
    ? `${fmtDiff(finalDiffAbs)}/${finalPointsLeft}`
    : `${fmtDiff(liveDiffAbs)} UP`;
  const loserLabel: string = isDone
    ? `${fmtDiff(finalDiffAbs)} DN`
    : `${fmtDiff(liveDiffAbs)} DN`;

  const topDiffLabel: string | null = !showDiffBadge
    ? null
    : isDone && winnerId
      ? topWin
        ? winnerLabel
        : loserLabel
      : topPts === bottomPts
        ? "AS"
        : topPts > bottomPts
          ? winnerLabel
          : loserLabel;
  const bottomDiffLabel: string | null = !showDiffBadge
    ? null
    : isDone && winnerId
      ? bottomWin
        ? winnerLabel
        : loserLabel
      : topPts === bottomPts
        ? "AS"
        : bottomPts > topPts
          ? winnerLabel
          : loserLabel;

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
          : behindOnCapture
            ? "border-red-500/70 bg-red-950/30 shadow-[0_0_24px_-10px_rgba(239,68,68,0.55)]"
            : isDone
              ? "border-emerald-500/30 bg-emerald-950/20"
              : isLive
                ? "border-cyan-400/40 bg-cyan-950/20 shadow-[0_0_24px_-12px_rgba(34,211,238,0.5)]"
                : "border-white/10 bg-[#0c1728]"
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-1 text-[9px] uppercase tracking-wider">
        <span className="flex items-center gap-1">
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-slate-400">
            R{match.round_no} · M{match.position_no}
          </span>
          {teeTime ? (
            <span className="inline-flex items-center gap-1 rounded bg-cyan-500/10 px-1.5 py-0.5 font-bold text-cyan-200">
              🕘 {teeTime}
              {groupNo != null ? (
                <span className="opacity-80">· G{groupNo}</span>
              ) : null}
            </span>
          ) : null}
        </span>
        {behindOnCapture && !isDone ? (
          <span
            className="inline-flex items-center gap-1 rounded-full bg-red-500/30 px-2 py-0.5 font-bold text-red-100"
            title="Otro grupo con salida posterior ya capturó más hoyos. Captura atrasada."
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-300" />
            CAPTURA ATRASADA · H{lastHolePlayed}/{holesPerMatch}
          </span>
        ) : isLive ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/20 px-2 py-0.5 font-bold text-cyan-200">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
            EN JUEGO · va en H{Math.max(lastHolePlayed, 1)}/{holesPerMatch}
          </span>
        ) : isDone ? (
          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 font-bold text-emerald-200">
            {playoffDecidedHole != null
              ? `✓ FINAL · Desempate H${playoffDecidedHole}`
              : decidedAtHole != null
                ? `✓ FINAL · decidido en H${decidedAtHole}`
                : `✓ FINAL · ${holesPlayed}/${holesPerMatch} hoyos`}
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
        diffLabel={topDiffLabel}
        isWinner={topWin}
        isAhead={isLive && topAhead}
      />
      <div className="my-0.5 text-center text-[9px] uppercase text-slate-600">
        vs
      </div>
      <Side
        team={bottomTeam}
        diffLabel={bottomDiffLabel}
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
  diffLabel,
  isWinner,
  isAhead,
}: {
  team: MatchPlayTeamRow | null;
  /**
   * Diferencial match play formateado ("5 UP", "5 DN", "AS"). `null` si
   * todavía no hay hoyos capturados.
   */
  diffLabel: string | null;
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
      {diffLabel !== null ? (
        <span
          className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-[12px] font-extrabold tracking-tight ${
            isWinner
              ? "bg-emerald-500/30 text-emerald-100"
              : isAhead
                ? "bg-cyan-500/30 text-cyan-100"
                : diffLabel === "AS"
                  ? "bg-amber-500/20 text-amber-200"
                  : "bg-white/10 text-slate-300"
          }`}
          title={
            diffLabel === "AS"
              ? "All Square (empate acumulado)"
              : diffLabel.includes("/")
                ? (() => {
                    const [up, left] = diffLabel.split("/");
                    return left === "0"
                      ? `Ganó ${up} arriba en el hoyo 18 (sin puntos por jugar)`
                      : `Ganó ${up} arriba con ${left} punto(s) por jugar (cada hoyo da máx. 2 pts en Bola Baja + Bola Alta)`;
                  })()
                : diffLabel.endsWith("UP")
                  ? "Va arriba en el match (puntos acumulados)"
                  : "Va abajo en el match (puntos acumulados)"
          }
        >
          {diffLabel}
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
