"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import {
  formatPhSum,
  teamPlayerNameWithPh,
  teamTournamentPhSum,
} from "@/lib/matchplay/auctionTeamPh";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import { prefersReducedMotion } from "@/lib/matchplay/auctionWheel";
import { currentOpenAuctionTeam } from "@/lib/matchplay/auctionOpenTurn";
import CasinoAuctionDrum from "@/components/matchplay/CasinoAuctionDrum";

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
};

type Phase = "idle" | "spinning" | "revealed" | "done";

const REVEAL_SIZE = "clamp(3.2rem, 7vw, 8rem)";
/** Giro TV: más lento; los últimos ~6 equipos se ven claramente. */
const TV_SPIN_MS = 7800;
const TV_REVEAL_PAUSE_MS = 900;

function playerLine(t: MatchPlayTeamRow, which: "a" | "b"): string {
  return teamPlayerNameWithPh(t, which);
}

function categoryLabel(t: MatchPlayTeamRow): string {
  return (
    t.player_a?.category_name ||
    t.player_a?.category_code ||
    t.player_b?.category_name ||
    t.player_b?.category_code ||
    "—"
  );
}

function phSumLabel(t: MatchPlayTeamRow): string {
  return formatPhSum(teamTournamentPhSum(t));
}

export default function SorteoProyeccionClient({
  tournamentId,
  tournamentName,
  teams: initialTeams,
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);
  const [phase, setPhase] = useState<Phase>("idle");
  const [winner, setWinner] = useState<MatchPlayTeamRow | null>(null);
  const [winnerOrder, setWinnerOrder] = useState<number | null>(null);
  const [drumTick, setDrumTick] = useState(0);
  const [spinPool, setSpinPool] = useState<MatchPlayTeamRow[]>([]);
  const [itemH, setItemH] = useState(132);

  const busyRef = useRef(false);
  const rollTimerRef = useRef<number | null>(null);
  const seenDrawnIdsRef = useRef<Set<string> | null>(null);

  const active = useMemo(
    () => teams.filter((t) => t.is_active),
    [teams]
  );
  const pending = useMemo(
    () =>
      active.filter(
        (t) => t.auction_order === null || t.auction_order === undefined
      ),
    [active]
  );
  const lastDrawn = useMemo(() => {
    const open = currentOpenAuctionTeam(active);
    if (open) return open;
    const drawn = active.filter(
      (t) => t.auction_order !== null && t.auction_order !== undefined
    );
    if (drawn.length === 0) return null;
    return drawn.reduce((a, b) =>
      (a.auction_order ?? 0) >= (b.auction_order ?? 0) ? a : b
    );
  }, [active]);

  const displayWinner =
    phase === "spinning" ? null : winner ?? lastDrawn;
  const displayOrder =
    phase === "spinning"
      ? null
      : winnerOrder ?? displayWinner?.auction_order ?? null;

  useEffect(() => {
    if (phase !== "idle") return;
    if (pending.length === 0 && lastDrawn) setPhase("done");
  }, [phase, pending.length, lastDrawn]);

  useEffect(() => {
    return () => {
      if (rollTimerRef.current) window.clearTimeout(rollTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const apply = () => {
      setItemH(
        Math.min(148, Math.max(118, Math.round(window.innerHeight / 7.2)))
      );
    };
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

  const runCasinoSpin = useCallback(
    (pool: MatchPlayTeamRow[], winnerTeam: MatchPlayTeamRow, order: number) => {
      if (seenDrawnIdsRef.current) {
        seenDrawnIdsRef.current.add(winnerTeam.id);
      }
      setWinner(winnerTeam);
      setWinnerOrder(order);
      setSpinPool(pool);
      setPhase("spinning");
      busyRef.current = true;

      const landOnWinner = () => {
        const idx = Math.max(0, pool.findIndex((t) => t.id === winnerTeam.id));
        setDrumTick(idx);
        setPhase("revealed");
        busyRef.current = false;
      };

      if (prefersReducedMotion() || pool.length <= 1) {
        landOnWinner();
        return;
      }

      // Aceleración → frenado largo: los últimos ~6 pasos se ven uno a uno.
      let elapsed = 0;
      let interval = 55;
      let cursor = 0;
      const winnerIdx = Math.max(
        0,
        pool.findIndex((t) => t.id === winnerTeam.id)
      );

      const step = () => {
        cursor += 1;
        setDrumTick(cursor);
        elapsed += interval;

        // Última fase (~6 equipos): intervalos crecientes.
        const remaining = TV_SPIN_MS - elapsed;
        if (remaining < 3200) {
          interval = Math.min(520, Math.round(interval * 1.22));
        } else {
          interval = Math.min(280, Math.round(interval * 1.12));
        }

        if (elapsed >= TV_SPIN_MS) {
          // Asegurar aterrizaje en el ganador (mismo índice modular que el tick).
          const target =
            cursor +
            ((winnerIdx - (cursor % pool.length) + pool.length) % pool.length);
          setDrumTick(target);
          rollTimerRef.current = window.setTimeout(() => {
            landOnWinner();
          }, TV_REVEAL_PAUSE_MS);
          return;
        }
        rollTimerRef.current = window.setTimeout(step, interval);
      };

      step();
    },
    []
  );

  // Sigue al operador: gira solo cuando cambia la pareja EN SUBASTA
  // (la de turno más bajo sin postura). No salta al 5 si el 4 sigue abierto.
  useEffect(() => {
    const open = currentOpenAuctionTeam(active);
    if (seenDrawnIdsRef.current === null) {
      seenDrawnIdsRef.current = new Set(
        active.filter((t) => t.auction_order != null).map((t) => t.id)
      );
      if (open) {
        setWinner(open);
        setWinnerOrder(open.auction_order ?? null);
        setPhase("revealed");
      }
      return;
    }
    if (busyRef.current) return;
    if (!open) return;
    if (winner?.id === open.id) return;
    const pool = active.filter(
      (t) => t.auction_order == null || t.id === open.id
    );
    if (pool.length === 0) return;
    runCasinoSpin(pool, open, open.auction_order ?? 0);
  }, [active, runCasinoSpin, winner?.id]);

  // Si el turno abierto más viejo cambia mientras no giramos, alinear.
  useEffect(() => {
    if (phase === "spinning" || busyRef.current) return;
    if (!lastDrawn) return;
    if (winner?.id === lastDrawn.id) return;
    if (lastDrawn.auction_bid != null) return;
    setWinner(lastDrawn);
    setWinnerOrder(lastDrawn.auction_order ?? null);
    setPhase("revealed");
  }, [lastDrawn, phase, winner]);

  const drumTeams =
    spinPool.length > 0
      ? spinPool
      : pending.length > 0
        ? pending
        : active;

  const spinning = phase === "spinning";
  const showDrum = spinning || (phase === "idle" && !displayWinner);

  return (
    <div className="relative flex h-dvh min-h-dvh flex-col overflow-hidden bg-[#07090d] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_rgba(251,191,36,0.1),_transparent_58%)]" />

      <header className="relative z-10 flex shrink-0 items-end justify-between gap-4 px-8 pt-5 pb-1">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold uppercase tracking-[0.35em] text-amber-300">
            Sorteo de subasta
          </div>
          <div className="mt-1 max-w-5xl text-xl font-bold leading-tight text-white md:text-2xl">
            {tournamentName}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {displayOrder != null && !spinning ? (
            <div className="text-right text-xl font-semibold text-white md:text-2xl">
              Pareja {displayOrder} de {active.length}
            </div>
          ) : (
            <div className="text-right text-lg font-semibold text-white md:text-xl">
              {pending.length} por salir · {active.length} parejas
            </div>
          )}
          <a
            href={`/matchplay/auction/show?tournament_id=${tournamentId}`}
            className="rounded-xl border-2 border-white/40 bg-white/10 px-5 py-2.5 text-lg font-black text-white hover:bg-white/20"
          >
            ← Volver a subasta
          </a>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4 pb-10">
        {showDrum && drumTeams.length > 0 ? (
          <div className="flex w-full flex-col items-center gap-6">
            {phase === "idle" ? (
              <div className="text-center text-xl font-semibold uppercase tracking-[0.2em] text-amber-300/90">
                Esperando rifa del operador…
              </div>
            ) : null}
            <CasinoAuctionDrum
              teams={drumTeams}
              activeIndex={
                spinning
                  ? drumTick
                  : Math.max(
                      0,
                      drumTeams.findIndex((t) => t.id === displayWinner?.id)
                    )
              }
              size="tv"
              itemHeight={itemH}
            />
          </div>
        ) : displayWinner ? (
          <RevealedPair
            team={displayWinner}
            order={displayOrder}
            total={active.length}
            done={phase === "done"}
          />
        ) : (
          <div className="text-3xl font-bold text-white">
            No hay parejas para sortear.
          </div>
        )}
      </main>
    </div>
  );
}

function RevealedPair({
  team,
  order,
  total,
  done,
}: {
  team: MatchPlayTeamRow;
  order: number | null;
  total: number;
  done?: boolean;
}) {
  return (
    <div className="flex w-full max-w-[1700px] flex-col items-center text-center">
      {done ? (
        <div className="mb-6 text-2xl font-bold uppercase tracking-[0.25em] text-amber-300">
          Sorteo completo
        </div>
      ) : null}
      <div
        className="max-w-full font-black leading-[0.92] text-white"
        style={{ fontSize: REVEAL_SIZE }}
      >
        {playerLine(team, "a")}
      </div>
      {playerLine(team, "b") ? (
        <div
          className="mt-3 max-w-full font-black leading-[0.92] text-amber-300"
          style={{ fontSize: REVEAL_SIZE }}
        >
          {playerLine(team, "b")}
        </div>
      ) : null}
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-2xl font-bold md:text-4xl">
        <span className="text-white">
          Hándicap torneo Σ{" "}
          <span className="text-amber-300">{phSumLabel(team)}</span>
        </span>
        <span className="text-neutral-600">·</span>
        <span className="text-white">{categoryLabel(team)}</span>
      </div>
      {order != null ? (
        <div className="mt-6 text-xl font-semibold text-neutral-300 md:text-2xl">
          Pareja {order} de {total}
        </div>
      ) : null}
    </div>
  );
}
