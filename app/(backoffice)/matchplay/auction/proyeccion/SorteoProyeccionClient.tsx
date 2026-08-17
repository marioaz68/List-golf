"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import { drawNextAuctionPairAction, releaseAuctionPairForRedrawAction } from "../../actions";
import {
  AUCTION_WHEEL_PAUSE_MS,
  AUCTION_WHEEL_SPIN_MS,
  prefersReducedMotion,
  wheelIndexProgress,
} from "@/lib/matchplay/auctionWheel";

type Props = {
  tournamentId: string;
  tournamentName: string;
  teams: MatchPlayTeamRow[];
};

type Phase =
  | "idle"
  | "ready"
  | "arming"
  | "spinning"
  | "paused"
  | "revealed"
  | "done";

const NAME_SIZE = "clamp(2.4rem, 5.2vw, 5.8rem)";
const REVEAL_SIZE = "clamp(4rem, 8vw, 9.5rem)";
/** Segmentos visibles en el tambor; el ganador cae en el del centro. */
const VISIBLE_SLOTS = 5;
const CENTER_SLOT = 2;

/** Colores tipo ruleta de premios (segmentos alternados). */
const SEGMENT_COLORS = [
  "#e11d48",
  "#0284c7",
  "#ca8a04",
  "#059669",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#0d9488",
  "#4f46e5",
  "#c026d3",
] as const;

function playerLine(t: MatchPlayTeamRow, which: "a" | "b"): string {
  const row = which === "a" ? t.player_a : t.player_b;
  if (row) return formatPlayerName(row.player);
  if (which === "a") return t.team_name?.split("/")[0]?.trim() || "—";
  const parts = (t.team_name ?? "").split("/");
  return parts[1]?.trim() || "";
}

function initials(t: MatchPlayTeamRow): string {
  const a = playerLine(t, "a");
  const b = playerLine(t, "b");
  const ia = a.trim().charAt(0) || "?";
  const ib = b.trim().charAt(0) || "";
  return (ia + ib).toUpperCase();
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

function hiLabel(t: MatchPlayTeamRow): string {
  if (t.combined_hi == null || !Number.isFinite(Number(t.combined_hi))) {
    return "—";
  }
  const n = Number(t.combined_hi);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function segmentColor(index: number, teamId: string): string {
  let h = 0;
  for (let i = 0; i < teamId.length; i++) h = (h + teamId.charCodeAt(i) * (i + 1)) % 997;
  return SEGMENT_COLORS[(index + h) % SEGMENT_COLORS.length]!;
}

function buildStrip(
  pool: MatchPlayTeamRow[],
  winnerId: string
): { strip: MatchPlayTeamRow[]; landIndex: number } {
  if (pool.length === 0) return { strip: [], landIndex: 1 };
  const winner = pool.find((t) => t.id === winnerId) ?? pool[0]!;
  const filler = pool.filter((t) => t.id !== winner.id);
  const cycle = filler.length > 0 ? filler : [winner];
  const minItems = Math.max(36, cycle.length * 3);
  const strip: MatchPlayTeamRow[] = [];
  let i = 0;
  while (strip.length < minItems) {
    strip.push(cycle[i % cycle.length]!);
    i += 1;
  }
  const landIndex = strip.length - 2;
  strip[landIndex] = winner;
  return { strip, landIndex };
}

function applyY(el: HTMLDivElement | null, y: number) {
  if (!el) return;
  el.style.transform = `translate3d(0, ${y}px, 0)`;
}

function offsetForIndex(k: number, rowH: number) {
  return (CENTER_SLOT - k) * rowH;
}

export default function SorteoProyeccionClient({
  tournamentId,
  tournamentName,
  teams: initialTeams,
}: Props) {
  const { teams } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);
  const [phase, setPhase] = useState<Phase>("idle");
  const [strip, setStrip] = useState<MatchPlayTeamRow[]>([]);
  const [landIndex, setLandIndex] = useState(1);
  const [winner, setWinner] = useState<MatchPlayTeamRow | null>(null);
  const [winnerOrder, setWinnerOrder] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [itemH, setItemH] = useState(168);
  const [orderOverlay, setOrderOverlay] = useState<
    Record<string, number | null>
  >({});

  const busyRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pauseTimerRef = useRef<number | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stripElRef = useRef<HTMLDivElement | null>(null);
  const seenDrawnIdsRef = useRef<Set<string> | null>(null);
  const spinCfgRef = useRef<{
    startK: number;
    endK: number;
    rowH: number;
  } | null>(null);
  const [spinGen, setSpinGen] = useState(0);

  const active = useMemo(
    () =>
      teams
        .filter((t) => t.is_active)
        .map((t) => {
          if (!Object.prototype.hasOwnProperty.call(orderOverlay, t.id)) {
            return t;
          }
          return { ...t, auction_order: orderOverlay[t.id] ?? null };
        }),
    [teams, orderOverlay]
  );
  const pending = useMemo(
    () =>
      active.filter(
        (t) => t.auction_order === null || t.auction_order === undefined
      ),
    [active]
  );
  const lastDrawn = useMemo(() => {
    const drawn = active.filter(
      (t) => t.auction_order !== null && t.auction_order !== undefined
    );
    if (drawn.length === 0) return null;
    return drawn.reduce((a, b) =>
      (a.auction_order ?? 0) >= (b.auction_order ?? 0) ? a : b
    );
  }, [active]);

  const hideWinner =
    phase === "spinning" ||
    phase === "arming" ||
    phase === "ready" ||
    phase === "paused";
  const displayWinner = hideWinner ? null : winner ?? lastDrawn;
  const displayOrder = hideWinner
    ? phase === "ready" && lastDrawn
      ? lastDrawn.auction_order
      : null
    : winnerOrder ?? displayWinner?.auction_order ?? null;

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const apply = () => {
      if (busyRef.current) return;
      const h = Math.round(el.clientHeight / VISIBLE_SLOTS);
      if (h > 96) setItemH(h);
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  useEffect(() => {
    if (phase !== "idle") return;
    if (pending.length === 0 && lastDrawn) setPhase("done");
  }, [phase, pending.length, lastDrawn]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (pauseTimerRef.current != null) window.clearTimeout(pauseTimerRef.current);
    };
  }, []);

  const runWheel = useCallback(
    (
      pool: MatchPlayTeamRow[],
      winnerTeam: MatchPlayTeamRow,
      order: number,
      rowH: number
    ) => {
      const built = buildStrip(pool, winnerTeam.id);
      setStrip(built.strip);
      setLandIndex(built.landIndex);
      setWinner(winnerTeam);
      setWinnerOrder(order);
      setOrderOverlay((prev) => ({ ...prev, [winnerTeam.id]: order }));
      if (seenDrawnIdsRef.current) {
        seenDrawnIdsRef.current.add(winnerTeam.id);
      }
      const startK = 1;
      const endK = built.landIndex;

      if (prefersReducedMotion() || pool.length <= 1) {
        spinCfgRef.current = null;
        setPhase("revealed");
        busyRef.current = false;
        return;
      }

      spinCfgRef.current = { startK, endK, rowH };
      setPhase("spinning");
      setSpinGen((n) => n + 1);
    },
    []
  );

  useLayoutEffect(() => {
    if (phase !== "spinning") return;
    const cfg = spinCfgRef.current;
    if (!cfg) return;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    if (pauseTimerRef.current != null) {
      window.clearTimeout(pauseTimerRef.current);
      pauseTimerRef.current = null;
    }
    const { startK, endK, rowH } = cfg;
    applyY(stripElRef.current, offsetForIndex(startK, rowH));
    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - t0) / AUCTION_WHEEL_SPIN_MS);
      const k = wheelIndexProgress(t, startK, endK);
      applyY(stripElRef.current, offsetForIndex(k, rowH));
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      applyY(stripElRef.current, offsetForIndex(endK, rowH));
      setPhase("paused");
      pauseTimerRef.current = window.setTimeout(() => {
        setPhase("revealed");
        busyRef.current = false;
      }, AUCTION_WHEEL_PAUSE_MS);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, spinGen]);

  useEffect(() => {
    const drawn = active.filter(
      (t) => t.auction_order !== null && t.auction_order !== undefined
    );
    if (seenDrawnIdsRef.current === null) {
      seenDrawnIdsRef.current = new Set(drawn.map((t) => t.id));
      return;
    }
    const fresh = drawn.filter((t) => !seenDrawnIdsRef.current!.has(t.id));
    for (const t of drawn) seenDrawnIdsRef.current.add(t.id);
    if (busyRef.current || fresh.length === 0) return;
    const winnerTeam = fresh.reduce((a, b) =>
      (a.auction_order ?? 0) >= (b.auction_order ?? 0) ? a : b
    );
    const pool = active.filter(
      (t) => t.auction_order == null || t.id === winnerTeam.id
    );
    const h = Math.max(110, Math.round(window.innerHeight / VISIBLE_SLOTS * 0.72));
    setItemH(h);
    busyRef.current = true;
    setError(null);
    runWheel(pool, winnerTeam, winnerTeam.auction_order ?? 0, h);
  }, [active, runWheel]);

  const handleGirar = useCallback(async (preferredOrder?: number | null) => {
    if (busyRef.current) return;
    if (pending.length === 0 && preferredOrder == null) {
      setPhase("done");
      return;
    }
    busyRef.current = true;
    setError(null);
    setPhase("arming");
    const pool = pending.length > 0 ? pending : active;
    const h = Math.max(110, Math.round(window.innerHeight / VISIBLE_SLOTS * 0.72));
    setItemH(h);
    const preview = buildStrip(pool, pool[0]!.id);
    setStrip(preview.strip);
    setLandIndex(preview.landIndex);
    applyY(stripElRef.current, offsetForIndex(CENTER_SLOT, h));

    const result = await drawNextAuctionPairAction(
      tournamentId,
      preferredOrder ?? null
    );
    if (!result.ok) {
      busyRef.current = false;
      setError(result.error);
      if (result.code === "empty") setPhase("done");
      else setPhase(lastDrawn ? "revealed" : "idle");
      return;
    }
    const winnerTeam =
      pool.find((t) => t.id === result.teamId) ??
      active.find((t) => t.id === result.teamId);
    if (!winnerTeam) {
      busyRef.current = false;
      setPhase("idle");
      setError("La pareja sorteada no está en la lista precargada.");
      return;
    }
    // Si la pareja no estaba en el pool (liberada hace un momento), armamos pool visual con active
    const spinPool =
      pool.some((t) => t.id === winnerTeam.id) ? pool : [...pool, winnerTeam];
    runWheel(spinPool, winnerTeam, result.auctionOrder, h);
  }, [pending, tournamentId, active, runWheel, lastDrawn]);

  const redrawThisTurn = useCallback(async () => {
    const team = winner ?? lastDrawn;
    if (!team || team.auction_order == null || busyRef.current) return;
    busyRef.current = true;
    setError(null);
    const released = await releaseAuctionPairForRedrawAction(
      tournamentId,
      team.id
    );
    if (!released.ok) {
      busyRef.current = false;
      setError(released.error);
      return;
    }
    setOrderOverlay((prev) => ({ ...prev, [team.id]: null }));
    setWinner(null);
    setWinnerOrder(null);
    busyRef.current = false;
    await handleGirar(released.freedOrder);
  }, [winner, lastDrawn, tournamentId, handleGirar]);

  const spinning =
    phase === "arming" || phase === "spinning" || phase === "paused";
  const canSpin = !spinning && pending.length > 0;
  const showWheel =
    phase === "arming" ||
    phase === "spinning" ||
    phase === "paused" ||
    phase === "ready" ||
    (phase === "idle" && !displayWinner);

  const goReadyForNext = () => {
    if (spinning) return;
    setWinner(null);
    setStrip([]);
    setPhase(pending.length === 0 ? "done" : "ready");
  };

  const visibleStrip =
    strip.length > 0 ? strip : pending.slice(0, 10);

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
          {displayOrder != null && phase !== "spinning" && phase !== "arming" ? (
            <div className="text-right text-xl font-semibold text-white md:text-2xl">
              Pareja {displayOrder} de {active.length}
            </div>
          ) : (
            <div className="text-right text-lg font-semibold text-white md:text-xl">
              {pending.length} por salir · {active.length} parejas
            </div>
          )}
          <a
            href={`/matchplay/auction/raffle?tournament_id=${tournamentId}`}
            className="rounded-lg border border-white/25 bg-white/5 px-3 py-1.5 text-sm font-semibold text-white/90 hover:bg-white/10"
          >
            ← Salir a subasta
          </a>
        </div>
      </header>

      <main className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center px-4">
        {showWheel ? (
          <div
            ref={stageRef}
            className="relative flex h-[min(76vh,860px)] w-full max-w-[1500px] items-center justify-center"
          >
            {phase === "ready" && strip.length === 0 ? (
              <div className="absolute inset-0 z-40 flex flex-col items-center justify-center px-8 text-center">
                <div className="text-2xl font-bold uppercase tracking-[0.2em] text-amber-300">
                  Listo para la siguiente
                </div>
                <div className="mt-4 max-w-4xl text-4xl font-black text-white md:text-5xl">
                  {lastDrawn
                    ? `Última: pareja ${lastDrawn.auction_order} · quedan ${pending.length}`
                    : `${pending.length} parejas por salir`}
                </div>
                <p className="mt-6 text-xl text-white/70">
                  Presiona Girar cuando toque sacar la siguiente pareja.
                </p>
              </div>
            ) : null}

            {/* Flecha indicadora (izquierda) */}
            <div
              className="pointer-events-none absolute left-[max(0px,calc(50%-min(46vw,700px)-36px))] z-30"
              style={{ top: "50%", transform: "translateY(-50%)" }}
              aria-hidden
            >
              <div
                className="h-0 w-0"
                style={{
                  borderTop: "28px solid transparent",
                  borderBottom: "28px solid transparent",
                  borderLeft: "52px solid #ef4444",
                  filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.55))",
                }}
              />
            </div>

            {/* Tambor cilíndrico */}
            <div
              className="relative h-full w-[min(92vw,1280px)] overflow-hidden rounded-[42px] border-[10px] border-[#1a1d24] shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
              style={{
                background:
                  "linear-gradient(90deg, #0b0d12 0%, #151922 8%, #0f1218 50%, #151922 92%, #0b0d12 100%)",
                opacity: phase === "ready" && strip.length === 0 ? 0.28 : 1,
              }}
            >
              {/* Rims / clavijas laterales */}
              <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-5 bg-gradient-to-r from-black/70 to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-5 bg-gradient-to-l from-black/70 to-transparent" />
              <div className="pointer-events-none absolute inset-y-3 left-1.5 z-20 flex flex-col justify-between py-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={`lp-${i}`}
                    className="h-2.5 w-2.5 rounded-full bg-[#2a2f3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)]"
                  />
                ))}
              </div>
              <div className="pointer-events-none absolute inset-y-3 right-1.5 z-20 flex flex-col justify-between py-2">
                {Array.from({ length: 9 }).map((_, i) => (
                  <span
                    key={`rp-${i}`}
                    className="h-2.5 w-2.5 rounded-full bg-[#2a2f3a] shadow-[inset_0_1px_2px_rgba(255,255,255,0.25)]"
                  />
                ))}
              </div>

              {/* Curvatura del cilindro */}
              <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(90deg,rgba(0,0,0,0.45)_0%,transparent_18%,transparent_82%,rgba(0,0,0,0.45)_100%)]" />
              <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[22%] bg-gradient-to-b from-black/75 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[22%] bg-gradient-to-t from-black/75 to-transparent" />

              {/* Marco ganador (centro) */}
              <div
                className="pointer-events-none absolute inset-x-3 z-20 rounded-xl border-[3px] border-white/90 shadow-[0_0_0_2px_rgba(239,68,68,0.55),0_0_36px_rgba(251,191,36,0.35)]"
                style={{
                  height: itemH,
                  top: "50%",
                  marginTop: -itemH / 2,
                }}
              />

              <div
                ref={stripElRef}
                className="relative z-[1] will-change-transform"
                style={{ transform: "translate3d(0, 0, 0)" }}
              >
                {visibleStrip.map((t, i) => {
                  const isLand = strip.length > 0 && i === landIndex;
                  const highlight = isLand && phase === "paused";
                  const color = segmentColor(i, t.id);
                  const a = playerLine(t, "a");
                  const b = playerLine(t, "b");
                  return (
                    <div
                      key={`${t.id}-${i}`}
                      className="relative flex items-center gap-4 border-b border-black/25 px-6 pr-8"
                      style={{
                        height: itemH,
                        background: `linear-gradient(90deg, ${color} 0%, ${color} 72%, rgba(0,0,0,0.18) 100%)`,
                        boxShadow: highlight
                          ? "inset 0 0 0 9999px rgba(255,255,255,0.12)"
                          : undefined,
                      }}
                    >
                      <div className="min-w-0 flex-1 text-left">
                        <div
                          className="truncate font-black uppercase leading-[0.95] tracking-tight text-white drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
                          style={{ fontSize: NAME_SIZE }}
                        >
                          {a}
                        </div>
                        {b ? (
                          <div
                            className="mt-1 truncate font-black uppercase leading-[0.95] tracking-tight text-white/95 drop-shadow-[0_2px_2px_rgba(0,0,0,0.45)]"
                            style={{ fontSize: NAME_SIZE }}
                          >
                            {b}
                          </div>
                        ) : null}
                      </div>
                      <div
                        className="flex h-[72%] aspect-square shrink-0 items-center justify-center rounded-full border-4 border-white/35 bg-black/25 text-2xl font-black text-white shadow-[inset_0_2px_8px_rgba(0,0,0,0.35)] md:text-4xl"
                        aria-hidden
                      >
                        {initials(t)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
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

        {error ? (
          <p className="mt-4 text-center text-lg font-semibold text-red-300">
            {error}
          </p>
        ) : null}
      </main>

      <footer className="relative z-10 flex shrink-0 flex-col items-center justify-center gap-3 px-6 pb-7 pt-3">
        <div className="flex w-full max-w-[920px] flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => void handleGirar()}
            disabled={!canSpin}
            className="min-h-[84px] min-w-[min(70vw,560px)] flex-1 rounded-2xl bg-amber-400 px-10 text-3xl font-black tracking-wide text-black shadow-[0_12px_40px_rgba(251,191,36,0.35)] disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500 disabled:shadow-none md:text-4xl"
          >
            {spinning
              ? "Girando…"
              : pending.length === 0
                ? "Sorteo completo"
                : phase === "revealed" || phase === "idle"
                  ? "Girar siguiente pareja"
                  : "Girar"}
          </button>
          {(phase === "revealed" || (phase === "idle" && displayWinner)) &&
          displayWinner?.auction_order != null ? (
            <button
              type="button"
              onClick={() => void redrawThisTurn()}
              disabled={spinning}
              className="min-h-[84px] min-w-[min(40vw,300px)] rounded-2xl border-2 border-rose-400/70 bg-rose-950/60 px-6 text-xl font-black text-rose-100 hover:bg-rose-900/70 disabled:opacity-50 md:text-2xl"
            >
              Volver a rifar turno #{displayWinner.auction_order}
            </button>
          ) : null}
          {(phase === "revealed" || (phase === "idle" && displayWinner)) &&
          pending.length > 0 ? (
            <button
              type="button"
              onClick={goReadyForNext}
              className="min-h-[84px] min-w-[min(40vw,280px)] rounded-2xl border-2 border-white/40 bg-white/10 px-6 text-2xl font-bold text-white hover:bg-white/15"
            >
              Listo · a subastar
            </button>
          ) : null}
        </div>
        {phase === "revealed" || (phase === "idle" && displayWinner) ? (
          <p className="text-center text-base text-white/60">
            «Listo · a subastar» oculta el resultado y deja la ruleta lista para
            el siguiente giro.
          </p>
        ) : null}
      </footer>
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
          HI combinado{" "}
          <span className="text-amber-300">{hiLabel(team)}</span>
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
