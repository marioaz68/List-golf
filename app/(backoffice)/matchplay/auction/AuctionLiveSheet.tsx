"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import { useMatchPlayTeamsRealtime } from "@/lib/matchplay/useMatchPlayTeamsRealtime";
import { saveAuctionSheet, applyAuctionSeeding } from "../actions";

type Row = {
  id: string;
  team_name: string | null;
  player_a_name: string;
  player_b_name: string | null;
  combined_hi: number | null;
  order: string;
  bid: string;
};

type Props = {
  tournamentId: string;
  teams: MatchPlayTeamRow[];
  potPercent: number | null;
  minBid: number | null;
  maxBid: number | null;
  currency: string;
  playerCoverPercent: number | null;
  prizeShares: Array<{ position: number; label: string; percent: number }>;
  flashStatus?: string | null;
  flashMessage?: string | null;
};

const inputCls =
  "w-full rounded border border-white/20 bg-[#0a1220] px-2 py-1 text-sm text-white outline-none focus:border-cyan-400";

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "32px",
  padding: "0 14px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#fff",
  fontWeight: 600,
  fontSize: "12px",
  cursor: "pointer",
};

const primaryStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#0891b2, #0e7490)",
  border: "1px solid #155e75",
};

const greenStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "linear-gradient(#22c55e, #15803d)",
  border: "1px solid #166534",
};

function money(v: number | null, currency: string) {
  if (v === null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString("es-MX", { maximumFractionDigits: 0 })} ${currency}`;
}

export default function AuctionLiveSheet({
  tournamentId,
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
  // dirtyIds bloquea sobreescribir lo que el usuario está editando con eventos
  // que llegan por realtime mientras teclea.
  const dirtyIds = useRef<Set<string>>(new Set());
  const lastPulseRef = useRef<number>(0);

  const [rows, setRows] = useState<Row[]>(() =>
    [...initialTeams]
      .sort((a, b) => {
        const oa = a.auction_order ?? Number.POSITIVE_INFINITY;
        const ob = b.auction_order ?? Number.POSITIVE_INFINITY;
        if (oa !== ob) return oa - ob;
        return (a.seed ?? 9999) - (b.seed ?? 9999);
      })
      .map<Row>((t) => ({
        id: t.id,
        team_name: t.team_name,
        player_a_name: t.player_a
          ? formatPlayerName(t.player_a.player)
          : "—",
        player_b_name: t.player_b
          ? formatPlayerName(t.player_b.player)
          : null,
        combined_hi: t.combined_hi,
        order: t.auction_order != null ? String(t.auction_order) : "",
        bid: t.auction_bid != null ? String(t.auction_bid) : "",
      }))
  );

  const updateRow = (id: string, field: "order" | "bid", value: string) => {
    dirtyIds.current.add(id);
    setRows((rs) =>
      rs.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  };

  // Reconciliar con realtime: añadir nuevos, refrescar los no-dirty.
  useEffect(() => {
    if (pulse === lastPulseRef.current) return;
    lastPulseRef.current = pulse;
    setRows((rs) => {
      const existing = new Map(rs.map((r) => [r.id, r]));
      const out: Row[] = [];
      for (const t of teams) {
        if (!t.is_active) continue;
        const prev = existing.get(t.id);
        if (prev && dirtyIds.current.has(t.id)) {
          out.push(prev);
          continue;
        }
        out.push({
          id: t.id,
          team_name: t.team_name,
          player_a_name: t.player_a
            ? formatPlayerName(t.player_a.player)
            : prev?.player_a_name ?? "—",
          player_b_name: t.player_b
            ? formatPlayerName(t.player_b.player)
            : prev?.player_b_name ?? null,
          combined_hi: t.combined_hi,
          order: t.auction_order != null ? String(t.auction_order) : "",
          bid: t.auction_bid != null ? String(t.auction_bid) : "",
        });
      }
      return out;
    });
  }, [teams, pulse]);

  // Tras guardar, las marcas dirty deben limpiarse (router refresca props).
  useEffect(() => {
    if (flashMessage && flashStatus !== "error") {
      dirtyIds.current.clear();
    }
  }, [flashMessage, flashStatus]);

  const autoNumber = () => {
    setRows((rs) => rs.map((r, i) => ({ ...r, order: String(i + 1) })));
  };

  const clearBids = () => {
    if (!confirm("¿Limpiar todas las posturas?")) return;
    setRows((rs) => rs.map((r) => ({ ...r, bid: "" })));
  };

  const sortedPreview = useMemo(() => {
    return [...rows]
      .map((r, idx) => ({
        ...r,
        bid_num: r.bid ? Number(r.bid) : null,
        order_num: r.order ? Number(r.order) : null,
        original_index: idx,
      }))
      .sort((a, b) => {
        const ba = a.bid_num ?? -Infinity;
        const bb = b.bid_num ?? -Infinity;
        if (bb !== ba) return bb - ba;
        const oa = a.order_num ?? Number.POSITIVE_INFINITY;
        const ob = b.order_num ?? Number.POSITIVE_INFINITY;
        if (oa !== ob) return oa - ob;
        return a.original_index - b.original_index;
      });
  }, [rows]);

  const totals = useMemo(() => {
    const total = rows.reduce(
      (acc, r) => acc + (r.bid ? Number(r.bid) || 0 : 0),
      0
    );
    const filled = rows.filter((r) => r.bid !== "").length;
    const missing = rows.length - filled;
    const pot = potPercent ? (total * potPercent) / 100 : total;
    return { total, filled, missing, pot };
  }, [rows, potPercent]);

  return (
    <div className="space-y-3">
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

      <div className="grid gap-2 sm:grid-cols-5">
        <Stat label="Equipos" value={String(rows.length)} />
        <Stat
          label="Con postura"
          value={`${totals.filled} / ${rows.length}`}
          tone={totals.missing === 0 ? "ok" : "warn"}
        />
        <Stat label="Faltan" value={String(totals.missing)} />
        <Stat
          label="Subastado"
          value={money(totals.total, currency)}
          tone="ok"
        />
        <Stat
          label={`Bolsa (${potPercent ?? 100}%)`}
          value={money(totals.pot, currency)}
          tone="ok"
        />
      </div>

      {prizeShares.length > 0 ? (
        <details className="rounded border border-white/10 bg-[#0a1220] px-3 py-2">
          <summary className="cursor-pointer text-sm font-semibold text-amber-200">
            Distribución de bolsa proyectada
          </summary>
          <table className="mt-2 w-full text-left text-[12px]">
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
                    {money((totals.pot * p.percent) / 100, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <a
          href={`/matchplay/auction/show?tournament_id=${tournamentId}`}
          style={primaryStyle}
        >
          🎙 Subasta en vivo
        </a>
        <button type="button" style={buttonStyle} onClick={autoNumber}>
          Auto-numerar # 1..{rows.length}
        </button>
        <button type="button" style={buttonStyle} onClick={clearBids}>
          Limpiar posturas
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => window.print()}
        >
          Imprimir hoja
        </button>
        <span
          className={`ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] ${
            pulse > 0
              ? "bg-green-950/40 text-green-300"
              : "bg-slate-800 text-slate-400"
          }`}
          title="Conexión Supabase Realtime"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              pulse > 0 ? "bg-green-400" : "bg-slate-500"
            } animate-pulse`}
          />
          Realtime
        </span>
        <span className="text-xs text-slate-400">
          {minBid ? `Min ${money(minBid, currency)}` : ""}
          {minBid && maxBid ? " · " : ""}
          {maxBid ? `Max ${money(maxBid, currency)}` : ""}
        </span>
      </div>

      <form action={saveAuctionSheet}>
        <input type="hidden" name="tournament_id" value={tournamentId} />
        <div className="overflow-x-auto rounded border border-white/10">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-[#0a1220] text-[11px] uppercase tracking-wide text-slate-400">
              <tr>
                <th className="w-16 p-2 text-center">#</th>
                <th className="p-2">Equipo / Jugadores</th>
                <th className="w-24 p-2">HI</th>
                <th className="w-40 p-2">Postura ({currency})</th>
                <th className="w-32 p-2 print:hidden">Cubre {playerCoverPercent ?? "—"}%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const bidNum = r.bid ? Number(r.bid) : null;
                const cover =
                  bidNum && playerCoverPercent
                    ? (bidNum * playerCoverPercent) / 100
                    : null;
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-2">
                      <input type="hidden" name="team_id" value={r.id} />
                      <input
                        name="auction_order"
                        className={`${inputCls} text-center font-semibold`}
                        type="number"
                        min={1}
                        step="1"
                        value={r.order}
                        onChange={(e) =>
                          updateRow(r.id, "order", e.target.value)
                        }
                        placeholder="—"
                      />
                    </td>
                    <td className="p-2">
                      <div className="font-semibold text-white">
                        {r.team_name ?? r.player_a_name}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {r.player_a_name}
                        {r.player_b_name ? ` · ${r.player_b_name}` : ""}
                      </div>
                    </td>
                    <td className="p-2 text-cyan-300">
                      {r.combined_hi ?? "—"}
                    </td>
                    <td className="p-2">
                      <input
                        name="auction_bid"
                        className={`${inputCls} text-right font-semibold text-amber-200`}
                        type="number"
                        step="500"
                        min={0}
                        value={r.bid}
                        onChange={(e) =>
                          updateRow(r.id, "bid", e.target.value)
                        }
                        placeholder={
                          minBid ? `Min ${minBid}` : "Postura $"
                        }
                      />
                    </td>
                    <td className="p-2 text-amber-200 print:hidden">
                      {cover != null ? money(cover, currency) : "—"}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-slate-500">
                    No hay equipos. Forma parejas primero en{" "}
                    <code>/matchplay</code>.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
          <button type="submit" style={primaryStyle}>
            Guardar hoja
          </button>
          <a
            href={`/matchplay?tournament_id=${tournamentId}`}
            style={buttonStyle}
          >
            Volver a match play
          </a>
        </div>
      </form>

      {rows.length >= 2 ? (
        <div className="rounded border border-white/10 bg-[#0f172a] p-3 print:hidden">
          <h3 className="text-sm font-semibold text-cyan-200">
            Vista previa de siembra
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            Mayor postura → seed 1. En empate, mejor seed para menor #.
          </p>
          <ol className="mt-2 grid gap-1 text-[12px] sm:grid-cols-2 lg:grid-cols-3">
            {sortedPreview.slice(0, 64).map((r, i) => {
              const tieAbove =
                i > 0 &&
                sortedPreview[i - 1].bid_num === r.bid_num &&
                r.bid_num !== null;
              const tieBelow =
                i < sortedPreview.length - 1 &&
                sortedPreview[i + 1].bid_num === r.bid_num &&
                r.bid_num !== null;
              const inTie = tieAbove || tieBelow;
              return (
                <li
                  key={r.id}
                  className={`flex items-center gap-2 rounded px-2 py-1 ${
                    inTie ? "bg-amber-950/40" : "bg-white/5"
                  }`}
                >
                  <span className="w-6 text-right font-bold text-cyan-300">
                    {i + 1}.
                  </span>
                  <span className="flex-1 truncate">
                    {r.team_name ?? r.player_a_name}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    #{r.order || "—"}
                  </span>
                  <span className="font-semibold text-amber-200">
                    {r.bid_num != null ? money(r.bid_num, currency) : "—"}
                  </span>
                </li>
              );
            })}
          </ol>
          <form action={applyAuctionSeeding} className="mt-2">
            <input type="hidden" name="tournament_id" value={tournamentId} />
            <button type="submit" style={greenStyle}>
              Aplicar siembra (guarda seeds 1..N)
            </button>
            <span className="ml-2 text-[11px] text-slate-400">
              Recuerda guardar la hoja antes para que la siembra refleje las
              últimas posturas.
            </span>
          </form>
        </div>
      ) : null}

      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          input { color: black !important; background: white !important; border: 1px solid #ccc !important; }
          table { color: black; }
          th { color: black !important; }
          .border-white\\/10, .border-white\\/5, .border-white\\/20 { border-color: #ccc !important; }
          .bg-\\[\\#0a1220\\], .bg-\\[\\#0f172a\\] { background: white !important; }
          .text-white, .text-slate-200, .text-slate-300, .text-slate-400, .text-cyan-200, .text-cyan-300, .text-amber-200 { color: black !important; }
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
        ? "text-green-300"
        : "text-white";
  return (
    <div className="rounded border border-white/10 bg-[#0a1220] px-2 py-1.5">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div className={`text-sm font-bold ${color}`}>{value}</div>
    </div>
  );
}
