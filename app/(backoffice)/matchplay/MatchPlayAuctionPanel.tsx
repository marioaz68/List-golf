"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import {
  USGA_ALLOWANCES,
  combinedTeamHandicap,
  usgaAllowanceForFormat,
} from "@/lib/matchplay/usgaAllowances";
import type {
  MatchPlayMatchType,
  MatchPlayPairFormat,
} from "@/lib/matchplay/types";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import {
  applyUsgaAllowanceFromTable,
  applyAuctionSeeding,
  reorderAuctionSequence,
  updateTeamAuctionBid,
} from "./actions";

const inputClass =
  "w-full min-w-0 rounded border border-white/15 bg-[#0a1220] px-1.5 py-1 text-[11px] text-white";

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "11px",
  cursor: "pointer",
};

const primaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#0891b2, #0e7490)",
  border: "1px solid #155e75",
};

type PrizeShare = {
  position: number;
  label: string;
  percent: number;
  source?: string;
};

type Props = {
  tournamentId: string;
  teams: MatchPlayTeamRow[];
  matchType: MatchPlayMatchType;
  pairFormat: MatchPlayPairFormat;
  auctionEnabled: boolean;
  potPercent: number | null;
  minBid: number | null;
  maxBid: number | null;
  currency: string;
  playerCoverPercent: number | null;
  prizeShares: PrizeShare[];
  allowancePct: number | null;
  flashStatus?: string | null;
  flashMessage?: string | null;
};

function formatMoney(value: number, currency: string) {
  if (!Number.isFinite(value)) return "—";
  return `${currency === "USD" ? "$" : "$"}${value.toLocaleString("es-MX", {
    maximumFractionDigits: 0,
  })} ${currency}`;
}

export default function MatchPlayAuctionPanel({
  tournamentId,
  teams,
  matchType,
  pairFormat,
  auctionEnabled,
  potPercent,
  minBid,
  maxBid,
  currency,
  playerCoverPercent,
  prizeShares,
  allowancePct,
  flashStatus,
  flashMessage,
}: Props) {
  const usga = useMemo(
    () => usgaAllowanceForFormat(matchType, pairFormat),
    [matchType, pairFormat]
  );

  const ordered = useMemo(() => {
    return [...teams].sort((a, b) => {
      const bidA = a.auction_bid ?? -Infinity;
      const bidB = b.auction_bid ?? -Infinity;
      if (bidB !== bidA) return bidB - bidA;
      const ordA = a.auction_order ?? Number.POSITIVE_INFINITY;
      const ordB = b.auction_order ?? Number.POSITIVE_INFINITY;
      if (ordA !== ordB) return ordA - ordB;
      return (a.seed ?? 9999) - (b.seed ?? 9999);
    });
  }, [teams]);

  const totalRaised = ordered.reduce((acc, t) => acc + (t.auction_bid ?? 0), 0);
  const pot = potPercent ? (totalRaised * potPercent) / 100 : totalRaised;
  const unsoldCount = ordered.filter(
    (t) => t.auction_bid === null || t.auction_bid === undefined
  ).length;

  const recommendedPct =
    matchType === "individual"
      ? usga.match_play_pct
      : usga.match_play_pct;

  return (
    <div className="space-y-4 rounded-lg border border-amber-500/30 bg-[#0f172a] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-white">
            Subasta / Calcuta
            {auctionEnabled ? null : (
              <span className="ml-2 rounded bg-slate-700 px-1.5 py-0.5 text-[9px] font-medium text-slate-300">
                Deshabilitada en convocatoria
              </span>
            )}
            <Link
              href={`/matchplay/auction?tournament_id=${tournamentId}`}
              style={{ ...primaryStyle, marginLeft: 8 }}
            >
              Abrir hoja de subasta →
            </Link>
          </h2>
          <p className="mt-1 max-w-2xl text-[11px] text-slate-400">
            Captura la postura y el orden de salida a la subasta. Siembra:
            mayor postura → seed 1. En caso de empate de postura, gana el que
            salió primero (menor «#»). El bote suma {potPercent ?? 100}% de lo
            subastado y se reparte por <strong>Reparto bolsa</strong> en la
            convocatoria.
          </p>
        </div>
      </div>

      {flashMessage ? (
        <div
          className={`rounded px-2 py-1.5 text-[11px] ${
            flashStatus === "error"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {flashMessage}
        </div>
      ) : null}

      <div className="rounded border border-cyan-500/30 bg-cyan-950/20 p-2 text-[11px] text-cyan-100">
        <div className="font-semibold text-cyan-200">
          USGA — {usga.format_label}
        </div>
        <div className="mt-1">
          <strong>Match play:</strong> {usga.match_play_pct}% ·{" "}
          <strong>Stroke play:</strong> {usga.stroke_play_pct}%
        </div>
        <div className="mt-1 text-cyan-100/90">{usga.notes}</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <form action={applyUsgaAllowanceFromTable}>
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <input
              type="hidden"
              name="match_play_pct"
              value={usga.match_play_pct ?? ""}
            />
            <input
              type="hidden"
              name="allowance_value"
              value={usga.allowance_value}
            />
            <button type="submit" style={primaryStyle}>
              Aplicar {usga.match_play_pct}% recomendado por USGA
            </button>
          </form>
          {allowancePct ? (
            <span className="self-center text-[11px] text-slate-300">
              Actual: <strong>{allowancePct}%</strong>
            </span>
          ) : null}
        </div>
        <details className="mt-2 text-[11px] text-slate-300">
          <summary className="cursor-pointer text-cyan-300">
            Ver tabla completa USGA
          </summary>
          <table className="mt-2 w-full text-left">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="p-1">Formato</th>
                <th className="p-1">Match play</th>
                <th className="p-1">Stroke play</th>
              </tr>
            </thead>
            <tbody>
              {USGA_ALLOWANCES.map((row) => (
                <tr key={row.format_key} className="border-b border-white/5">
                  <td className="p-1">{row.format_label}</td>
                  <td className="p-1">{row.match_play_pct}%</td>
                  <td className="p-1">{row.stroke_play_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <Stat label="Equipos" value={ordered.length} />
        <Stat
          label="Sin postura"
          value={unsoldCount}
          tone={unsoldCount > 0 ? "warn" : "ok"}
        />
        <Stat
          label="Total subastado"
          value={formatMoney(totalRaised, currency)}
        />
        <Stat label={`Bolsa (${potPercent ?? 100}%)`} value={formatMoney(pot, currency)} />
      </div>

      {prizeShares.length > 0 ? (
        <div className="rounded border border-white/10 bg-[#0a1220] p-2">
          <div className="mb-1.5 text-[11px] font-semibold text-slate-200">
            Distribución de bolsa
          </div>
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="p-1">Puesto</th>
                <th className="p-1">%</th>
                <th className="p-1">Monto</th>
              </tr>
            </thead>
            <tbody>
              {prizeShares.map((p, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="p-1">{p.label}</td>
                  <td className="p-1">{p.percent}%</td>
                  <td className="p-1 font-semibold text-amber-200">
                    {formatMoney((pot * p.percent) / 100, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-[12px] font-semibold text-slate-200">
            Posturas por equipo
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {ordered.length >= 1 ? (
              <form action={reorderAuctionSequence}>
                <input type="hidden" name="tournament_id" value={tournamentId} />
                <button
                  type="submit"
                  style={buttonStyle}
                  title="Asigna # de salida 1..N a los equipos según el orden actual"
                >
                  Renumerar orden 1..N
                </button>
              </form>
            ) : null}
            {ordered.length >= 2 ? (
              <form action={applyAuctionSeeding}>
                <input type="hidden" name="tournament_id" value={tournamentId} />
                <button type="submit" style={primaryStyle}>
                  Aplicar siembra por subasta
                </button>
              </form>
            ) : null}
          </div>
        </div>
        {minBid != null || maxBid != null ? (
          <p className="text-[11px] text-slate-400">
            Postura mínima:{" "}
            <strong className="text-slate-200">
              {minBid != null ? formatMoney(minBid, currency) : "—"}
            </strong>{" "}
            · máxima:{" "}
            <strong className="text-slate-200">
              {maxBid != null ? formatMoney(maxBid, currency) : "—"}
            </strong>
            {playerCoverPercent
              ? ` · jugador cubre ${playerCoverPercent}% de su postura`
              : ""}
          </p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[11px] text-slate-200">
            <thead>
              <tr className="border-b border-white/10 text-slate-400">
                <th className="p-1.5" title="Posición proyectada de siembra">
                  Seed
                </th>
                <th className="p-1.5" title="Orden de salida a la subasta">
                  #
                </th>
                <th className="p-1.5">Equipo</th>
                <th className="p-1.5">HI USGA</th>
                <th className="p-1.5">Postura</th>
                <th className="p-1.5">Cubre {playerCoverPercent ?? "—"}%</th>
              </tr>
            </thead>
            <tbody>
              {ordered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-3 text-slate-500">
                    Sin equipos. Forma parejas en la sección de arriba.
                  </td>
                </tr>
              ) : (
                ordered.map((t, i) => {
                  const hi_a = t.player_a?.effective_hi ?? 0;
                  const hi_b = t.player_b?.effective_hi ?? null;
                  const usgaHi = combinedTeamHandicap({
                    pair_format: pairFormat,
                    match_type: matchType,
                    hi_a,
                    hi_b,
                    allowance_pct: allowancePct ?? recommendedPct ?? 100,
                  });
                  const playerCover =
                    playerCoverPercent && t.auction_bid
                      ? (t.auction_bid * playerCoverPercent) / 100
                      : null;
                  // detectar empate de postura para resaltar la regla de desempate
                  const tieAbove =
                    i > 0 &&
                    (ordered[i - 1].auction_bid ?? null) === (t.auction_bid ?? null) &&
                    t.auction_bid !== null;
                  const tieBelow =
                    i < ordered.length - 1 &&
                    (ordered[i + 1].auction_bid ?? null) === (t.auction_bid ?? null) &&
                    t.auction_bid !== null;
                  const inTie = tieAbove || tieBelow;
                  return (
                    <tr
                      key={t.id}
                      className={`border-b border-white/5 ${
                        inTie ? "bg-amber-950/30" : ""
                      }`}
                      title={
                        inTie
                          ? "Empate de postura: ordenado por # de salida (menor gana)"
                          : undefined
                      }
                    >
                      <td className="p-1.5 font-semibold text-cyan-300">
                        {i + 1}
                      </td>
                      <td className="p-1.5">
                        <form
                          action={updateTeamAuctionBid}
                          className="flex gap-1"
                        >
                          <input
                            type="hidden"
                            name="tournament_id"
                            value={tournamentId}
                          />
                          <input type="hidden" name="team_id" value={t.id} />
                          <input
                            type="hidden"
                            name="auction_bid"
                            value={t.auction_bid ?? ""}
                          />
                          <input
                            name="auction_order"
                            type="number"
                            min={1}
                            step="1"
                            className={inputClass}
                            style={{ width: 56 }}
                            placeholder="—"
                            defaultValue={t.auction_order ?? ""}
                            title="Orden de salida a la subasta"
                          />
                          <button
                            type="submit"
                            style={buttonStyle}
                            title="Guardar orden"
                          >
                            #
                          </button>
                        </form>
                      </td>
                      <td className="p-1.5">
                        <div className="font-medium">
                          {t.team_name ??
                            formatPlayerName(t.player_a?.player ?? {})}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          HI A {hi_a}
                          {hi_b !== null ? ` · HI B ${hi_b}` : ""}
                        </div>
                      </td>
                      <td className="p-1.5 text-cyan-200">{usgaHi}</td>
                      <td className="p-1.5">
                        <form
                          action={updateTeamAuctionBid}
                          className="flex gap-1"
                        >
                          <input
                            type="hidden"
                            name="tournament_id"
                            value={tournamentId}
                          />
                          <input type="hidden" name="team_id" value={t.id} />
                          <input
                            name="auction_bid"
                            type="number"
                            step="500"
                            className={inputClass}
                            style={{ width: 100 }}
                            placeholder={`Min ${minBid ?? "—"}`}
                            defaultValue={t.auction_bid ?? ""}
                          />
                          <button
                            type="submit"
                            style={buttonStyle}
                            title="Guardar postura"
                          >
                            $
                          </button>
                        </form>
                      </td>
                      <td className="p-1.5 text-amber-200">
                        {playerCover != null
                          ? formatMoney(playerCover, currency)
                          : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
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
  value: string | number;
  tone?: "warn" | "ok";
}) {
  const color =
    tone === "warn"
      ? "text-amber-300"
      : tone === "ok"
        ? "text-green-300"
        : "text-white";
  return (
    <div className="rounded border border-white/10 bg-[#0a1220] px-2 py-1.5">
      <div className="text-[10px] text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
