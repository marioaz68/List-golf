"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import {
  formatPhSum,
  teamPlayerNameWithPh,
  teamTournamentPhSum,
} from "@/lib/matchplay/auctionTeamPh";
import {
  awardedAuctionTeams,
  currentOpenAuctionTeam,
  nextAuctionTurnNumber,
  openUnbidAuctionTeams,
} from "@/lib/matchplay/auctionOpenTurn";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import {
  awardAuctionBid,
  drawNextAuctionPairAction,
  releaseAuctionPairForRedrawAction,
  resetAuctionData,
} from "../../actions";
import { prefersReducedMotion } from "@/lib/matchplay/auctionWheel";
import CasinoAuctionDrum from "@/components/matchplay/CasinoAuctionDrum";

type PrizeShare = { position: number; label: string; percent: number };

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
  potPercent: number | null;
  minBid: number | null;
  maxBid: number | null;
  currency: string;
  playerCoverPercent: number | null;
  prizeShares: PrizeShare[];
  flashStatus?: string | null;
  flashMessage?: string | null;
};

function money(v: number | null, currency: string) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `$${Math.round(v).toLocaleString("es-MX")} ${currency}`;
}

function teamLabel(t: MatchPlayTeamRow) {
  if (t.team_name) return t.team_name;
  if (t.player_a) return formatPlayerName(t.player_a.player);
  return "(equipo)";
}

function teamPlayers(t: MatchPlayTeamRow) {
  const a = teamPlayerNameWithPh(t, "a") || "—";
  const b = teamPlayerNameWithPh(t, "b");
  return b ? `${a}  ·  ${b}` : a;
}

const CONFETTI_COLORS = [
  "#22d3ee",
  "#facc15",
  "#a855f7",
  "#34d399",
  "#f97316",
  "#ec4899",
  "#60a5fa",
];

export default function RaffleStage({
  tournamentId,
  tournamentName,
  teams: initialTeams,
  potPercent,
  minBid,
  maxBid,
  currency,
  playerCoverPercent,
  prizeShares,
  flashStatus,
  flashMessage,
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);

  const pending = useMemo(
    () =>
      teams.filter(
        (t) =>
          t.is_active &&
          (t.auction_order === null || t.auction_order === undefined)
      ),
    [teams]
  );
  const awarded = useMemo(() => awardedAuctionTeams(teams), [teams]);
  const openUnbid = useMemo(() => openUnbidAuctionTeams(teams), [teams]);
  const openTeam = useMemo(() => currentOpenAuctionTeam(teams), [teams]);
  const activeTotal = teams.filter((t) => t.is_active).length;

  const seedingPreview = useMemo(() => {
    return [...teams]
      .filter((t) => t.is_active)
      .sort((a, b) => {
        const ba = a.auction_bid ?? -Infinity;
        const bb = b.auction_bid ?? -Infinity;
        if (bb !== ba) return bb - ba;
        const oa = a.auction_order ?? Number.POSITIVE_INFINITY;
        const ob = b.auction_order ?? Number.POSITIVE_INFINITY;
        return oa - ob;
      });
  }, [teams]);

  const totals = useMemo(() => {
    const total = awarded.reduce((acc, t) => acc + (t.auction_bid ?? 0), 0);
    const pot = potPercent != null ? (total * potPercent) / 100 : total;
    return { total, pot };
  }, [awarded, potPercent]);

  // ============ Motor de rifa teatral ============
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [bidInput, setBidInput] = useState<string>(
    minBid != null ? String(minBid) : ""
  );
  const [rolling, setRolling] = useState(false);
  const [rollDisplayId, setRollDisplayId] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(false);
  const [shake, setShake] = useState(false);
  const [asideFromQueue, setAsideFromQueue] = useState(false);
  const [preferredOrder, setPreferredOrder] = useState<number | null>(null);
  const [redrawBusy, setRedrawBusy] = useState(false);
  const [drumTick, setDrumTick] = useState(0);
  const [drawError, setDrawError] = useState<string | null>(null);
  const rollTimerRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement | null>(null);
  const bidInputRef = useRef<HTMLInputElement | null>(null);

  const currentTeam = useMemo(
    () => teams.find((t) => t.id === currentTeamId) ?? null,
    [teams, currentTeamId]
  );
  const rollDisplayTeam = useMemo(
    () => teams.find((t) => t.id === rollDisplayId) ?? null,
    [teams, rollDisplayId]
  );

  const startRoll = useCallback(async (reuseOrder?: number | null) => {
    const orderHint = reuseOrder ?? preferredOrder;
    if (pending.length === 0 && orderHint == null) return;
    if (rolling || redrawBusy) return;
    if (orderHint == null && openTeam) {
      setDrawError(
        `La pareja del turno #${openTeam.auction_order} sigue en subasta. Adjudícala antes de rifar la siguiente.`
      );
      setCurrentTeamId(openTeam.id);
      setRollDisplayId(openTeam.id);
      setAsideFromQueue(false);
      return;
    }

    setAsideFromQueue(false);
    setRolling(true);
    setCelebrate(false);
    setDrawError(null);
    setCurrentTeamId(null);
    setDrumTick(0);

    const pool = teams.filter((t) => t.is_active);
    if (pool.length === 0) {
      setRolling(false);
      return;
    }
    const result = await drawNextAuctionPairAction(
      tournamentId,
      orderHint
    );
    setPreferredOrder(null);
    if (!result.ok) {
      setRolling(false);
      setDrawError(result.error);
      return;
    }
    const winnerId = result.teamId;

    const landOnWinner = () => {
      setRollDisplayId(winnerId);
      setCurrentTeamId(winnerId);
      setShake(true);
      setCelebrate(true);
      setRolling(false);
      setBidInput(minBid != null ? String(minBid) : "");
      window.setTimeout(() => setShake(false), 700);
      window.setTimeout(() => setCelebrate(false), 4500);
      window.setTimeout(() => bidInputRef.current?.focus(), 800);
    };

    if (prefersReducedMotion() || pool.length <= 1) {
      landOnWinner();
      return;
    }

    let elapsed = 0;
    const total = 6200;
    let interval = 55;
    let cursor = 0;

    const step = () => {
      const pick = pool[cursor % pool.length];
      cursor += 1;
      if (pick) {
        setRollDisplayId(pick.id);
        setDrumTick(cursor);
      }
      elapsed += interval;
      // Últimos ~6 equipos: frena de verdad
      if (total - elapsed < 2800) {
        interval = Math.min(480, Math.round(interval * 1.2));
      } else {
        interval = Math.min(320, Math.round(interval * 1.14));
      }
      if (elapsed >= total) {
        landOnWinner();
        if (rollTimerRef.current) {
          window.clearTimeout(rollTimerRef.current);
          rollTimerRef.current = null;
        }
        return;
      }
      rollTimerRef.current = window.setTimeout(step, interval);
    };

    step();
  }, [pending, rolling, redrawBusy, tournamentId, minBid, preferredOrder, teams, openTeam]);

  const redrawThisTurn = useCallback(async () => {
    if (!currentTeam || rolling || redrawBusy) return;
    if (currentTeam.auction_order == null) return;
    const order = currentTeam.auction_order;
    setRedrawBusy(true);
    const released = await releaseAuctionPairForRedrawAction(
      tournamentId,
      currentTeam.id
    );
    setRedrawBusy(false);
    if (!released.ok) return;
    setPreferredOrder(released.freedOrder);
    setCurrentTeamId(null);
    setRollDisplayId(null);
    setAsideFromQueue(true);
    // Liberar y girar de inmediato reutilizando el mismo # de turno
    window.setTimeout(() => {
      void startRoll(released.freedOrder);
    }, 80);
  }, [currentTeam, rolling, redrawBusy, tournamentId, startRoll]);

  useEffect(() => {
    return () => {
      if (rollTimerRef.current) {
        window.clearTimeout(rollTimerRef.current);
      }
    };
  }, []);

  // Si el equipo actual ya tiene postura, soltarlo para el siguiente.
  useEffect(() => {
    if (!currentTeam) return;
    if (currentTeam.auction_bid != null) {
      setCurrentTeamId(null);
      setRollDisplayId(null);
      setAsideFromQueue(false);
    }
  }, [currentTeam]);

  useEffect(() => {
    if (rolling) return;
    const latest = openTeam;
    if (!latest) return;
    if (asideFromQueue) return;
    if (currentTeamId === latest.id) return;
    setCurrentTeamId(latest.id);
    setRollDisplayId(latest.id);
    setBidInput(minBid != null ? String(minBid) : "");
  }, [openTeam, rolling, currentTeamId, asideFromQueue, minBid]);

  const displayTeam = rolling ? rollDisplayTeam : currentTeam;
  const projectedBid = bidInput ? Number(bidInput) : null;
  const projectedSeed = useMemo(() => {
    if (!currentTeam || projectedBid === null) return null;
    let rank = 1;
    for (const t of teams) {
      if (!t.is_active) continue;
      if (t.id === currentTeam.id) continue;
      const bid = t.auction_bid ?? -Infinity;
      if (bid > projectedBid) rank++;
    }
    return rank;
  }, [currentTeam, projectedBid, teams]);

  // Confeti: array estable de 80 piezas
  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 80 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 1.6 + Math.random() * 1.4,
        rotate: Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        shape: i % 3, // 0 cuadrado, 1 círculo, 2 barra
      })),
    []
  );

  const nextTurnNumber =
    currentTeam?.auction_order != null
      ? currentTeam.auction_order
      : nextAuctionTurnNumber(teams);
  const canSpinNext = pending.length > 0 && !openTeam && !rolling && !redrawBusy;
  const progressPct =
    activeTotal > 0 ? Math.round((awarded.length / activeTotal) * 100) : 0;

  return (
    <div className="raffle-root relative flex min-h-[calc(100dvh-56px)] flex-col bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] text-white">
      {/* Flash banner */}
      {flashMessage ? (
        <div
          className={`mx-4 mt-3 rounded px-3 py-2 text-sm ${
            flashStatus === "error"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}
      {drawError ? (
        <div className="mx-4 mt-3 rounded border border-red-500/40 bg-red-950/40 px-3 py-2 text-sm text-red-100">
          {drawError}
        </div>
      ) : null}

      {/* HEADER */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pt-3 sm:px-6">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.3em] text-cyan-300/70">
            🎰 Rifa de turnos · {tournamentName}
          </div>
          <h1 className="mt-1 text-2xl font-extrabold leading-none text-white sm:text-3xl">
            Turno{" "}
            <span className="text-amber-300">
              #{String(nextTurnNumber).padStart(2, "0")}
            </span>{" "}
            <span className="text-slate-400">de {activeTotal}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Stat label="Pendientes" value={String(pending.length)} tone="warn" />
          <Stat label="Adjudicados" value={String(awarded.length)} tone="ok" />
          <Stat
            label={`Bolsa (${potPercent ?? 100}%)`}
            value={money(totals.pot, currency)}
            tone="ok"
          />
        </div>
      </header>

      {/* Barra de progreso */}
      <div className="mx-4 mt-2 h-2 overflow-hidden rounded-full bg-white/5 sm:mx-6">
        <div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-emerald-400 to-amber-300 transition-all duration-700"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* ESCENARIO PRINCIPAL */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-6 sm:px-6">
        {/* Confeti */}
        {celebrate ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {confettiPieces.map((p, i) => (
              <span
                key={i}
                className="confetti-piece"
                style={
                  {
                    left: `${p.left}%`,
                    backgroundColor: p.color,
                    animationDelay: `${p.delay}s`,
                    animationDuration: `${p.duration}s`,
                    transform: `rotate(${p.rotate}deg)`,
                    width: p.shape === 2 ? 4 : 9,
                    height: p.shape === 2 ? 16 : 9,
                    borderRadius: p.shape === 1 ? "50%" : 2,
                  } as React.CSSProperties
                }
              />
            ))}
          </div>
        ) : null}

        {/* Card central */}
        <section
          className={`raffle-card relative w-full max-w-5xl rounded-3xl border border-amber-500/25 bg-gradient-to-br from-[#0a0c10] to-[#12161f] p-6 shadow-[0_0_60px_-10px_rgba(251,191,36,0.35)] sm:p-10 ${
            shake ? "raffle-shake" : ""
          }`}
        >
          <div className="pointer-events-none absolute -inset-2 rounded-[28px] bg-gradient-to-br from-rose-500/10 via-transparent to-amber-400/10 blur-2xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[12px] font-bold uppercase tracking-[0.3em] text-amber-300">
              {rolling
                ? "Ruleta girando…"
                : currentTeam
                  ? "Pareja en subasta"
                  : pending.length === 0
                    ? "Subasta completa"
                    : "Listo para rifar"}
            </h2>
            {currentTeam && !rolling ? (
              <span className="rounded-full border border-amber-400/40 bg-amber-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-200">
                Turno #{nextTurnNumber}
              </span>
            ) : preferredOrder != null ? (
              <span className="rounded-full border border-rose-400/40 bg-rose-950/40 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-200">
                Re-rifando turno #{preferredOrder}
              </span>
            ) : null}
          </div>

          {/* Tambor casino */}
          {(rolling || displayTeam) && teams.filter((t) => t.is_active).length > 0 ? (
            <div className="relative mt-5">
              <CasinoAuctionDrum
                teams={teams.filter((t) => t.is_active)}
                activeIndex={
                  rolling
                    ? drumTick
                    : Math.max(
                        0,
                        teams
                          .filter((t) => t.is_active)
                          .findIndex((t) => t.id === displayTeam?.id)
                      )
                }
                itemHeight={104}
              />
              {!rolling && currentTeam ? (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <Chip
                    label="Hándicap torneo Σ"
                    value={
                      currentTeam
                        ? formatPhSum(teamTournamentPhSum(currentTeam))
                        : "—"
                    }
                  />
                  <Chip label="Turno" value={`#${nextTurnNumber}`} tone="amber" />
                  {projectedSeed != null ? (
                    <Chip
                      label="Seed proyectado"
                      value={`#${projectedSeed}`}
                      tone="amber"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="mt-8 text-center text-[18px] text-slate-300 sm:text-[22px]">
              Presiona{" "}
              <span className="font-bold text-amber-300">
                «Girar ruleta»
              </span>{" "}
              para elegir al azar una de las{" "}
              <strong className="text-cyan-200">{pending.length}</strong>{" "}
              parejas pendientes.
            </div>
          )}

          {/* Acciones */}
          <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
            {rolling || (!currentTeam && canSpinNext) ? (
              <button
                type="button"
                onClick={() => void startRoll()}
                disabled={!canSpinNext && !rolling}
                className={`raffle-mega-btn ${
                  !canSpinNext && !rolling ? "is-disabled" : ""
                }`}
              >
                {rolling
                  ? "Girando…"
                  : pending.length === 0
                    ? "Sin pendientes"
                    : `Girar ruleta · turno #${nextTurnNumber}`}
              </button>
            ) : currentTeam ? (
              <>
                <form
                  ref={formRef}
                  action={awardAuctionBid}
                  className="flex flex-col items-center gap-3 sm:flex-row"
                >
                  <input
                    type="hidden"
                    name="tournament_id"
                    value={tournamentId}
                  />
                  <input type="hidden" name="team_id" value={currentTeam.id} />
                  <input type="hidden" name="redirect_to" value="raffle" />
                  <div className="flex items-center gap-2 rounded-2xl border border-amber-400/40 bg-[#0a1220] px-4 py-2">
                    <span className="text-2xl font-extrabold text-amber-300">
                      $
                    </span>
                    <input
                      ref={bidInputRef}
                      name="auction_bid"
                      type="number"
                      min={0}
                      step="500"
                      value={bidInput}
                      onChange={(e) => setBidInput(e.target.value)}
                      placeholder={
                        minBid ? `Min ${money(minBid, currency).replace("$", "")}` : "Postura"
                      }
                      className="w-44 bg-transparent text-3xl font-extrabold text-amber-200 outline-none placeholder:text-amber-500/40 sm:w-56 sm:text-4xl"
                    />
                  </div>
                  <button type="submit" className="raffle-success-btn">
                    ✓ Adjudicar
                  </button>
                </form>
                {currentTeam.auction_order != null ? (
                  <button
                    type="button"
                    className="rounded-lg border-2 border-rose-400/60 bg-rose-950/50 px-4 py-3 text-sm font-black uppercase tracking-wide text-rose-100 hover:bg-rose-900/70 disabled:opacity-50"
                    onClick={() => void redrawThisTurn()}
                    disabled={rolling || redrawBusy}
                    title="La pareja vuelve al pool y se rifa de nuevo este mismo número de turno"
                  >
                    {redrawBusy
                      ? "Liberando…"
                      : `Volver a rifar turno #${currentTeam.auction_order}`}
                  </button>
                ) : null}
                <Link
                  href={`/matchplay/auction/show?tournament_id=${tournamentId}`}
                  className="rounded-lg border border-slate-500 bg-slate-700/40 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-slate-700/70"
                >
                  ← Ir a subasta
                </Link>
                {openUnbid
                  .filter((t) => t.id !== openTeam?.id)
                  .map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="rounded-lg border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-xs font-bold text-amber-100 hover:bg-amber-900/60 disabled:opacity-50"
                      disabled={rolling || redrawBusy}
                      onClick={async () => {
                        setRedrawBusy(true);
                        await releaseAuctionPairForRedrawAction(
                          tournamentId,
                          t.id
                        );
                        setRedrawBusy(false);
                      }}
                    >
                      Liberar turno #{t.auction_order} (aún no toca)
                    </button>
                  ))}
              </>
            ) : (
              <p className="text-center text-sm text-slate-400">
                Hay un turno abierto. Espera a que se sincronice.
              </p>
            )}
          </div>

          {openUnbid.length > 1 ? (
            <p className="relative mt-3 text-center text-sm font-semibold text-amber-200">
              Hay más de un turno sin adjudicar (
              {openUnbid.map((t) => `#${t.auction_order}`).join(", ")}). Se
              mantiene el #{openTeam?.auction_order}. Libera los demás con
              «Volver a rifar» en esa pareja, o adjudica primero el turno actual.
            </p>
          ) : null}
          {currentTeam && !rolling && currentTeam.auction_order != null ? (
            <p className="relative mt-3 text-center text-[12px] text-slate-400">
              «Volver a rifar turno» no borra la pareja: la regresa al sorteo y
              vuelve a girar el mismo número de turno (por si no está en sala).
            </p>
          ) : null}

          {/* Ayudas mínimas / máximas */}
          {(minBid != null || maxBid != null) && currentTeam && !rolling ? (
            <p className="relative mt-4 text-center text-[12px] text-slate-400">
              Postura mínima:{" "}
              <strong className="text-slate-200">
                {minBid != null ? money(minBid, currency) : "—"}
              </strong>{" "}
              · máxima:{" "}
              <strong className="text-slate-200">
                {maxBid != null ? money(maxBid, currency) : "—"}
              </strong>
              {playerCoverPercent
                ? ` · jugador cubre ${playerCoverPercent}% (${
                    projectedBid != null
                      ? money(
                          (projectedBid * playerCoverPercent) / 100,
                          currency
                        )
                      : "—"
                  })`
                : ""}
            </p>
          ) : null}
        </section>

        {/* Distribución de bolsa */}
        {prizeShares.length > 0 ? (
          <section className="mt-6 w-full max-w-5xl rounded-xl border border-amber-500/30 bg-[#0a1220]/80 p-3">
            <h3 className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">
              Distribución de bolsa proyectada
            </h3>
            <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {prizeShares.map((p, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5"
                >
                  <span className="text-[12px] text-slate-300">
                    {p.label} ({p.percent}%)
                  </span>
                  <span className="text-[13px] font-bold text-amber-200">
                    {money((totals.pot * p.percent) / 100, currency)}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </main>

      {/* FOOTER: pendientes + adjudicados + sembrado + atajos */}
      <footer className="grid gap-3 px-4 pb-4 pt-2 sm:px-6 lg:grid-cols-[1fr_1fr_1fr]">
        <Panel
          title={`Pendientes (${pending.length})`}
          accent="amber"
          empty="Sin pendientes — subasta completa."
        >
          {pending.length > 0 ? (
            <ul className="max-h-[200px] space-y-1 overflow-y-auto pr-1 text-[12px]">
              {pending.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between rounded bg-white/5 px-2 py-1.5"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentTeamId(t.id);
                      setRollDisplayId(t.id);
                      setBidInput(minBid != null ? String(minBid) : "");
                      setTimeout(() => bidInputRef.current?.focus(), 60);
                    }}
                    className="flex-1 truncate text-left text-slate-200 hover:text-cyan-300"
                    title="Subastar manualmente este equipo"
                  >
                    {teamLabel(t)}
                  </button>
                  <span className="text-[10px] text-slate-500">
                    Σ PH {formatPhSum(teamTournamentPhSum(t))}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel
          title={`Adjudicados (${awarded.length})`}
          accent="green"
          empty="Aún no hay adjudicados."
        >
          {awarded.length > 0 ? (
            <ul className="max-h-[200px] space-y-1 overflow-y-auto pr-1 text-[12px]">
              {[...awarded].reverse().map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5"
                >
                  <span className="w-7 text-right text-[11px] font-bold text-slate-400">
                    #{t.auction_order}
                  </span>
                  <span className="flex-1 truncate text-slate-200">
                    {teamLabel(t)}
                  </span>
                  <span className="text-[13px] font-bold text-amber-200">
                    {money(t.auction_bid ?? null, currency)}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </Panel>

        <Panel title="Sembrado en vivo (top 16)" accent="cyan">
          <ol className="max-h-[200px] space-y-1 overflow-y-auto pr-1 text-[12px]">
            {seedingPreview.slice(0, 16).map((t, i) => {
              const isCurrent = t.id === currentTeamId;
              const isAwarded =
                t.auction_order !== null && t.auction_order !== undefined;
              return (
                <li
                  key={t.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    isCurrent
                      ? "border border-cyan-300 bg-cyan-950/40"
                      : isAwarded
                        ? "bg-white/5"
                        : "bg-white/[0.02] opacity-70"
                  }`}
                >
                  <span className="w-6 text-right text-[13px] font-bold text-cyan-300">
                    {i + 1}.
                  </span>
                  <span className="flex-1 truncate text-slate-100">
                    {teamLabel(t)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    #{t.auction_order ?? "—"}
                  </span>
                  <span className="text-[12px] font-bold text-amber-200">
                    {t.auction_bid != null
                      ? money(t.auction_bid, currency)
                      : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
        </Panel>
      </footer>

      {/* ATAJOS al pie */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 bg-black/30 px-4 py-2 text-[12px] sm:px-6">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/matchplay/auction/proyeccion?tournament_id=${tournamentId}`}
            className="rounded border border-amber-400/50 bg-amber-950/50 px-3 py-1.5 font-bold text-amber-100 hover:bg-amber-900/60"
          >
            📺 Sorteo TV
          </Link>
          <Link
            href={`/torneos/${tournamentId}/cuadro-vivo`}
            target="_blank"
            className="rounded border border-emerald-400/40 bg-emerald-950/40 px-3 py-1.5 font-bold text-emerald-200 hover:bg-emerald-900/60"
            title="Abre el cuadro público en nueva ventana — se va armando conforme adjudicas"
          >
            🎯 Cuadro público en vivo ↗
          </Link>
          <Link
            href={`/torneos/${tournamentId}/matches-vivo`}
            target="_blank"
            className="rounded border border-cyan-400/40 bg-cyan-950/40 px-3 py-1.5 font-bold text-cyan-200 hover:bg-cyan-900/60"
            title="Abre matches en vivo en nueva ventana"
          >
            📺 Matches en vivo ↗
          </Link>
          <Link
            href={`/matchplay/auction?tournament_id=${tournamentId}`}
            className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
          >
            📝 Hoja de subasta
          </Link>
          <Link
            href={`/matchplay/auction/show?tournament_id=${tournamentId}`}
            className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
          >
            📺 Vista clásica
          </Link>
          <Link
            href={`/matchplay?tournament_id=${tournamentId}`}
            className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
          >
            ← Match play
          </Link>
        </div>
        <form action={resetAuctionData}>
          <input type="hidden" name="tournament_id" value={tournamentId} />
          <input type="hidden" name="redirect_to" value="raffle" />
          <button
            type="submit"
            className="rounded border border-red-500/40 bg-red-950/40 px-3 py-1.5 text-red-200 hover:bg-red-950/70"
            onClick={(e) => {
              if (
                !confirm(
                  "¿Reiniciar TODAS las posturas y orden de la subasta? (no toca seeds aplicados)"
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            Reiniciar subasta
          </button>
        </form>
      </div>

      <style>{`
        .raffle-mega-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 18px 36px;
          border-radius: 18px;
          font-size: 26px;
          font-weight: 900;
          letter-spacing: 0.04em;
          color: #0b1224;
          background: linear-gradient(135deg, #fde68a, #f59e0b 60%, #b45309);
          border: 1px solid #b45309;
          box-shadow:
            0 0 0 3px rgba(245, 158, 11, 0.2),
            0 12px 32px -8px rgba(245, 158, 11, 0.6),
            inset 0 -4px 0 rgba(0, 0, 0, 0.15);
          text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
          cursor: pointer;
          transition: transform 0.1s ease, box-shadow 0.2s ease;
          animation: raffle-pulse 1.8s ease-in-out infinite;
        }
        .raffle-mega-btn:hover {
          transform: translateY(-2px);
          box-shadow:
            0 0 0 4px rgba(245, 158, 11, 0.3),
            0 18px 40px -10px rgba(245, 158, 11, 0.7),
            inset 0 -4px 0 rgba(0, 0, 0, 0.15);
        }
        .raffle-mega-btn.is-disabled {
          opacity: 0.5;
          cursor: not-allowed;
          animation: none;
        }
        @keyframes raffle-pulse {
          0%, 100% { box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.25), 0 12px 32px -8px rgba(245, 158, 11, 0.6), inset 0 -4px 0 rgba(0, 0, 0, 0.15); }
          50% { box-shadow: 0 0 0 8px rgba(245, 158, 11, 0.10), 0 16px 40px -10px rgba(245, 158, 11, 0.65), inset 0 -4px 0 rgba(0, 0, 0, 0.15); }
        }

        .raffle-success-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 14px 28px;
          border-radius: 14px;
          font-size: 18px;
          font-weight: 800;
          color: #052e16;
          background: linear-gradient(135deg, #86efac, #22c55e 60%, #15803d);
          border: 1px solid #166534;
          box-shadow: 0 10px 24px -8px rgba(34, 197, 94, 0.6);
          cursor: pointer;
        }
        .raffle-success-btn:hover { filter: brightness(1.05); }

        .raffle-shake {
          animation: raffle-shake 0.7s ease-in-out 1;
        }
        @keyframes raffle-shake {
          0%, 100% { transform: translateX(0); }
          15% { transform: translateX(-6px) rotate(-0.4deg); }
          30% { transform: translateX(6px) rotate(0.4deg); }
          45% { transform: translateX(-5px) rotate(-0.3deg); }
          60% { transform: translateX(5px) rotate(0.3deg); }
          75% { transform: translateX(-2px); }
        }

        .raffle-flicker {
          animation: raffle-flicker 0.32s steps(2) infinite;
        }
        @keyframes raffle-flicker {
          0%, 100% { filter: blur(0) brightness(1); transform: scale(0.99); }
          50% { filter: blur(0.5px) brightness(1.15); transform: scale(1.01); }
        }

        .raffle-reveal {
          animation: raffle-reveal 0.55s cubic-bezier(0.2, 1.6, 0.4, 1) 1;
        }
        @keyframes raffle-reveal {
          0% { opacity: 0; transform: scale(0.5) rotate(-2deg); filter: blur(8px); }
          70% { opacity: 1; transform: scale(1.06) rotate(0.3deg); filter: blur(0); }
          100% { opacity: 1; transform: scale(1) rotate(0); filter: blur(0); }
        }

        .confetti-piece {
          position: absolute;
          top: -10px;
          opacity: 0.9;
          animation-name: confetti-fall;
          animation-timing-function: linear;
          animation-iteration-count: 1;
          animation-fill-mode: forwards;
        }
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) rotate(0); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
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
  tone?: "warn" | "ok";
}) {
  const color =
    tone === "warn"
      ? "text-amber-300"
      : tone === "ok"
        ? "text-emerald-300"
        : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1220]/80 px-3 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`text-base font-bold ${color}`}>{value}</div>
    </div>
  );
}

function Chip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "amber";
}) {
  const color = tone === "amber" ? "text-amber-200" : "text-cyan-200";
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1">
      <span className="text-[10px] uppercase text-slate-400">{label}</span>
      <span className={`text-[14px] font-bold ${color}`}>{value}</span>
    </span>
  );
}

function Panel({
  title,
  accent,
  empty,
  children,
}: {
  title: string;
  accent: "amber" | "green" | "cyan";
  empty?: string;
  children?: React.ReactNode;
}) {
  const color =
    accent === "amber"
      ? "text-amber-300"
      : accent === "green"
        ? "text-emerald-300"
        : "text-cyan-300";
  return (
    <section className="rounded-xl border border-white/10 bg-[#0a1220]/80 p-3">
      <h3
        className={`text-[11px] font-bold uppercase tracking-[0.18em] ${color}`}
      >
        {title}
      </h3>
      <div className="mt-2">
        {children}
        {empty && !children ? (
          <p className="text-[12px] text-slate-500">{empty}</p>
        ) : null}
      </div>
    </section>
  );
}
