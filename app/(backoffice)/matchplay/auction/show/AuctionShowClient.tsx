"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import { awardAuctionBid, resetAuctionData } from "../../actions";

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

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 38,
  padding: "0 18px",
  borderRadius: 8,
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#fff",
  fontWeight: 700,
  fontSize: 14,
  cursor: "pointer",
  textDecoration: "none",
};

const primary: React.CSSProperties = {
  ...btn,
  background: "linear-gradient(#0891b2, #0e7490)",
  border: "1px solid #155e75",
};

const success: React.CSSProperties = {
  ...btn,
  background: "linear-gradient(#22c55e, #15803d)",
  border: "1px solid #166534",
  fontSize: 16,
  minHeight: 48,
  padding: "0 28px",
};

const danger: React.CSSProperties = {
  ...btn,
  background: "linear-gradient(#dc2626, #991b1b)",
  border: "1px solid #7f1d1d",
};

const warn: React.CSSProperties = {
  ...btn,
  background: "linear-gradient(#f59e0b, #b45309)",
  border: "1px solid #78350f",
  fontSize: 16,
  minHeight: 48,
  padding: "0 28px",
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
  const a = t.player_a ? formatPlayerName(t.player_a.player) : "—";
  const b = t.player_b ? formatPlayerName(t.player_b.player) : null;
  return b ? `${a} · ${b}` : a;
}

export default function AuctionShowClient({
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
  const { teams, pulse } = useMatchPlayTeamsRealtime(tournamentId, initialTeams);

  const pending = useMemo(
    () =>
      teams.filter(
        (t) => t.is_active && (t.auction_order === null || t.auction_order === undefined)
      ),
    [teams]
  );

  const awarded = useMemo(
    () =>
      teams
        .filter((t) => t.is_active && t.auction_order !== null && t.auction_order !== undefined)
        .sort((a, b) => (a.auction_order ?? 0) - (b.auction_order ?? 0)),
    [teams]
  );

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
    const pot = potPercent ? (total * potPercent) / 100 : total;
    return { total, pot };
  }, [awarded, potPercent]);

  // Pulse flash on realtime updates
  const [pulseClass, setPulseClass] = useState("");
  useEffect(() => {
    if (pulse === 0) return;
    setPulseClass("ring-2 ring-cyan-400 ring-offset-2 ring-offset-[#0a1220]");
    const t = setTimeout(() => setPulseClass(""), 800);
    return () => clearTimeout(t);
  }, [pulse]);

  // ============ Motor de rifa ============
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [bidInput, setBidInput] = useState<string>(
    minBid != null ? String(minBid) : ""
  );
  const [rolling, setRolling] = useState(false);
  const [rollDisplayId, setRollDisplayId] = useState<string | null>(null);
  const rollTimerRef = useRef<number | null>(null);

  const currentTeam = useMemo(
    () => teams.find((t) => t.id === currentTeamId) ?? null,
    [teams, currentTeamId]
  );
  const rollDisplayTeam = useMemo(
    () => teams.find((t) => t.id === rollDisplayId) ?? null,
    [teams, rollDisplayId]
  );

  const startRoll = useCallback(() => {
    if (pending.length === 0) return;
    if (rolling) return;
    setRolling(true);

    const candidates = pending.filter((t) => t.id !== currentTeamId);
    const pool = candidates.length > 0 ? candidates : pending;

    let elapsed = 0;
    const total = 2400; // ms
    let interval = 60;

    const step = () => {
      const pick = pool[Math.floor(Math.random() * pool.length)];
      if (pick) setRollDisplayId(pick.id);
      elapsed += interval;
      interval = Math.min(280, Math.round(interval * 1.18));
      if (elapsed >= total) {
        const final = pool[Math.floor(Math.random() * pool.length)];
        if (final) {
          setRollDisplayId(final.id);
          setCurrentTeamId(final.id);
        }
        setRolling(false);
        setBidInput(minBid != null ? String(minBid) : "");
        if (rollTimerRef.current) {
          window.clearTimeout(rollTimerRef.current);
          rollTimerRef.current = null;
        }
        return;
      }
      rollTimerRef.current = window.setTimeout(step, interval);
    };

    step();
  }, [pending, rolling, currentTeamId, minBid]);

  useEffect(() => {
    return () => {
      if (rollTimerRef.current) {
        window.clearTimeout(rollTimerRef.current);
      }
    };
  }, []);

  // Si el equipo actual ya quedó adjudicado por otra sesión, lo soltamos.
  useEffect(() => {
    if (!currentTeam) return;
    if (currentTeam.auction_order != null) {
      setCurrentTeamId(null);
      setRollDisplayId(null);
    }
  }, [currentTeam]);

  const skipCurrent = () => {
    setCurrentTeamId(null);
    setRollDisplayId(null);
    setBidInput(minBid != null ? String(minBid) : "");
  };

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

  return (
    <div className={`space-y-4 ${pulseClass} rounded-xl transition-all`}>
      {flashMessage ? (
        <div
          className={`rounded px-3 py-2 text-sm ${
            flashStatus === "error"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      {/* HEADER STATS */}
      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Equipos" value={`${awarded.length} / ${teams.length}`} />
        <Stat label="Pendientes" value={String(pending.length)} tone="warn" />
        <Stat label="Subastado" value={money(totals.total, currency)} tone="ok" />
        <Stat
          label={`Bolsa (${potPercent ?? 100}%)`}
          value={money(totals.pot, currency)}
          tone="ok"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* MAIN: motor de rifa + adjudicación */}
        <div className="space-y-3">
          <div className="rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-[#0a1220] to-[#0f172a] p-6 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm uppercase tracking-wider text-cyan-300">
                {rolling
                  ? "🎰 Rifando…"
                  : currentTeam
                    ? "Subastando ahora"
                    : "Sin equipo seleccionado"}
              </h2>
              <div className="text-[11px] text-slate-400">
                {tournamentName}
              </div>
            </div>

            {displayTeam ? (
              <div
                className={`mt-3 transition-all ${
                  rolling
                    ? "scale-95 opacity-80"
                    : "scale-100 opacity-100"
                }`}
              >
                <div className="text-[40px] font-extrabold leading-tight text-white sm:text-[56px]">
                  {teamLabel(displayTeam)}
                </div>
                <div className="mt-1 text-[14px] text-slate-300 sm:text-[16px]">
                  {teamPlayers(displayTeam)}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-[13px] text-slate-300">
                  <Chip
                    label="HI combinado"
                    value={displayTeam.combined_hi ?? "—"}
                  />
                  {rolling ? null : currentTeam ? (
                    <>
                      <Chip
                        label="Salida #"
                        value={String(
                          (awarded.length || 0) + 1
                        )}
                      />
                      {projectedSeed != null ? (
                        <Chip
                          label="Seed proyectado"
                          value={`#${projectedSeed}`}
                          tone="amber"
                        />
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="mt-3 text-[18px] text-slate-400">
                Presiona <strong>«Rifar próximo»</strong> para que el motor
                seleccione al azar uno de los {pending.length} equipos
                pendientes.
              </div>
            )}

            {/* Acciones del motor */}
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startRoll}
                disabled={rolling || pending.length === 0}
                style={{
                  ...warn,
                  opacity: rolling || pending.length === 0 ? 0.5 : 1,
                  cursor:
                    rolling || pending.length === 0 ? "not-allowed" : "pointer",
                }}
              >
                🎲 {currentTeam ? "Rifar otro" : "Rifar próximo"}
              </button>
              {currentTeam && !rolling ? (
                <>
                  <form
                    action={awardAuctionBid}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="hidden"
                      name="tournament_id"
                      value={tournamentId}
                    />
                    <input
                      type="hidden"
                      name="team_id"
                      value={currentTeam.id}
                    />
                    <input type="hidden" name="redirect_to" value="show" />
                    <input
                      name="auction_bid"
                      type="number"
                      min={0}
                      step="500"
                      value={bidInput}
                      onChange={(e) => setBidInput(e.target.value)}
                      placeholder={
                        minBid ? `Min ${money(minBid, currency)}` : "Postura"
                      }
                      className="w-44 rounded-lg border border-amber-400/40 bg-[#0a1220] px-3 py-2 text-2xl font-extrabold text-amber-200 outline-none focus:border-amber-300"
                      autoFocus
                    />
                    <button type="submit" style={success}>
                      ✓ Adjudicar
                    </button>
                  </form>
                  <button type="button" style={btn} onClick={skipCurrent}>
                    Saltar
                  </button>
                </>
              ) : null}
            </div>

            {minBid != null || maxBid != null ? (
              <p className="mt-3 text-[11px] text-slate-400">
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
          </div>

          {/* Distribución de bolsa */}
          {prizeShares.length > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-[#0a1220] p-3">
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-amber-300">
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
            </div>
          ) : null}

          {/* Sembrado en vivo */}
          <div className="rounded-xl border border-cyan-500/30 bg-[#0a1220] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[12px] font-bold uppercase tracking-wider text-cyan-300">
                Sembrado en vivo
              </h3>
              <div className="text-[11px] text-slate-400">
                Mayor postura → seed 1. En empate, mejor seed para menor #.
              </div>
            </div>
            <ol className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2 lg:grid-cols-2">
              {seedingPreview.slice(0, 32).map((t, i) => {
                const isCurrent = t.id === currentTeamId;
                const isAwarded =
                  t.auction_order !== null && t.auction_order !== undefined;
                const tieAbove =
                  i > 0 &&
                  (seedingPreview[i - 1].auction_bid ?? null) ===
                    (t.auction_bid ?? null) &&
                  t.auction_bid !== null;
                const tieBelow =
                  i < seedingPreview.length - 1 &&
                  (seedingPreview[i + 1].auction_bid ?? null) ===
                    (t.auction_bid ?? null) &&
                  t.auction_bid !== null;
                const inTie = tieAbove || tieBelow;
                return (
                  <li
                    key={t.id}
                    className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                      isCurrent
                        ? "border border-cyan-300 bg-cyan-950/40"
                        : inTie
                          ? "bg-amber-950/40"
                          : isAwarded
                            ? "bg-white/5"
                            : "bg-white/[0.02] opacity-70"
                    }`}
                  >
                    <span className="w-6 text-right text-[14px] font-bold text-cyan-300">
                      {i + 1}.
                    </span>
                    <span className="flex-1 truncate text-slate-100">
                      {teamLabel(t)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      #{t.auction_order ?? "—"}
                    </span>
                    <span className="text-[13px] font-bold text-amber-200">
                      {t.auction_bid != null
                        ? money(t.auction_bid, currency)
                        : "—"}
                    </span>
                  </li>
                );
              })}
            </ol>
            {seedingPreview.length > 32 ? (
              <p className="mt-2 text-[11px] text-slate-500">
                Mostrando primeros 32 de {seedingPreview.length}.
              </p>
            ) : null}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#0a1220] p-3">
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-300">
              Pendientes ({pending.length})
            </h3>
            <ul className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1 text-[12px]">
              {pending.length === 0 ? (
                <li className="text-slate-500">Sin pendientes — subasta completa.</li>
              ) : (
                pending.map((t) => (
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
                      }}
                      className="flex-1 truncate text-left text-slate-200 hover:text-cyan-300"
                      title="Subastar manualmente este equipo"
                    >
                      {teamLabel(t)}
                    </button>
                    <span className="text-[10px] text-slate-500">
                      HI {t.combined_hi ?? "—"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0a1220] p-3">
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-green-300">
              Adjudicados ({awarded.length})
            </h3>
            <ul className="mt-2 max-h-[420px] space-y-1 overflow-y-auto pr-1 text-[12px]">
              {[...awarded].reverse().map((t) => (
                <li
                  key={t.id}
                  className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5"
                >
                  <span className="w-6 text-right text-[11px] font-bold text-slate-400">
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
              {awarded.length === 0 ? (
                <li className="text-slate-500">Aún no hay adjudicados.</li>
              ) : null}
            </ul>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0a1220] p-3">
            <h3 className="text-[12px] font-bold uppercase tracking-wider text-slate-300">
              Atajos
            </h3>
            <div className="mt-2 flex flex-col gap-1.5">
              <Link
                href={`/matchplay/auction?tournament_id=${tournamentId}`}
                style={btn}
              >
                Hoja de subasta
              </Link>
              <Link
                href={`/matchplay?tournament_id=${tournamentId}`}
                style={btn}
              >
                Match play (bracket)
              </Link>
              <form action={resetAuctionData}>
                <input type="hidden" name="tournament_id" value={tournamentId} />
                <input type="hidden" name="redirect_to" value="show" />
                <button
                  type="submit"
                  style={{ ...danger, width: "100%" }}
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
          </div>
        </div>
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
  tone?: "warn" | "ok";
}) {
  const color =
    tone === "warn"
      ? "text-amber-300"
      : tone === "ok"
        ? "text-green-300"
        : "text-white";
  return (
    <div className="rounded-lg border border-white/10 bg-[#0a1220] px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`text-lg font-bold ${color}`}>{value}</div>
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
