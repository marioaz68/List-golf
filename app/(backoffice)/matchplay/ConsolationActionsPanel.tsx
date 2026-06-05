"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { StrokeAggregatePairRow } from "@/lib/matchplay/strokeAggregateStandings";
import StrokeAggregateTeeSheetDnD from "./StrokeAggregateTeeSheetDnD";

const btn: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  padding: "0 12px",
  borderRadius: "6px",
  border: "1px solid #155e75",
  background: "linear-gradient(#0891b2, #0e7490)",
  color: "#fff",
  fontWeight: 700,
  fontSize: "11px",
  cursor: "pointer",
};

type Result = {
  ok?: boolean;
  message?: string;
  error?: string;
  created?: number;
  processed?: number;
  groupsCreated?: number;
};

type StandingsPayload = {
  ok: boolean;
  pairs: StrokeAggregatePairRow[];
  message: string;
  roundNo: number | null;
  allowancePct: number;
};

export default function ConsolationActionsPanel({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [result, setResult] = useState<{ tone: "ok" | "err"; text: string } | null>(
    null
  );
  const [standings, setStandings] = useState<StandingsPayload | null>(null);
  const [standingsLoading, setStandingsLoading] = useState(false);
  const [showDnd, setShowDnd] = useState(false);

  const refreshStandings = useCallback(async () => {
    setStandingsLoading(true);
    try {
      const res = await fetch(
        `/api/matchplay/stroke-aggregate-standings?tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { cache: "no-store" }
      );
      const data = (await res.json()) as StandingsPayload;
      setStandings(data);
    } catch {
      setStandings(null);
    } finally {
      setStandingsLoading(false);
    }
  }, [tournamentId]);

  useEffect(() => {
    void refreshStandings();
  }, [refreshStandings]);

  async function call(endpoint: string, key: string) {
    setLoading(key);
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tournament_id: tournamentId }),
      });
      const data = (await res.json()) as Result;
      if (data.ok) {
        setResult({
          tone: "ok",
          text:
            data.message ??
            `Listo. ${data.created ?? data.processed ?? 0} salida(s).`,
        });
        void refreshStandings();
      } else {
        setResult({ tone: "err", text: data.error ?? "Error desconocido." });
      }
    } catch (err) {
      setResult({
        tone: "err",
        text: err instanceof Error ? err.message : "Error de red.",
      });
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-amber-500/30 bg-[#1a1206] p-3">
      <div>
        <h3 className="text-sm font-bold text-amber-200">Consolaciones</h3>
        <p className="mt-1 text-[11px] text-amber-100/70">
          Genera las salidas de consolación según la convocatoria: perdedores de
          R3 → Consolación Match Play (R4–R5); perdedores de R1, R2 y de la
          consolación MP → Stroke Play Agregado en la última ronda (foursomes
          random por género).
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          style={btn}
          disabled={loading != null}
          onClick={() =>
            call("/api/matchplay/backfill-consolation", "mp")
          }
        >
          {loading === "mp" ? "Generando…" : "↻ Consolación Match Play"}
        </button>
        <button
          type="button"
          style={btn}
          disabled={loading != null}
          onClick={() =>
            call("/api/matchplay/create-stroke-consolation", "stroke")
          }
        >
          {loading === "stroke" ? "Creando…" : "⛳ Crear salidas Stroke Agregado"}
        </button>
        <button
          type="button"
          style={{
            ...btn,
            border: "1px solid #334155",
            background: "#1e293b",
          }}
          disabled={standingsLoading}
          onClick={() => void refreshStandings()}
        >
          {standingsLoading ? "…" : "↻ Clasificación stroke"}
        </button>
        <button
          type="button"
          style={{
            ...btn,
            border: "1px solid #155e75",
            background: showDnd ? "#0e7490" : "#0c4a5e",
          }}
          onClick={() => setShowDnd((v) => !v)}
        >
          {showDnd ? "Ocultar salidas (DnD)" : "✋ Acomodar salidas (DnD)"}
        </button>
        <Link
          href={`/torneos/${tournamentId}/consolacion-stroke`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[30px] items-center rounded-md border border-sky-600/50 bg-sky-950/50 px-3 text-[11px] font-bold text-sky-200 hover:bg-sky-900/60"
        >
          Ver pública ↗
        </Link>
      </div>

      {showDnd ? (
        <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
          <StrokeAggregateTeeSheetDnD tournamentId={tournamentId} />
        </div>
      ) : null}

      {result ? (
        <div
          className={`rounded px-2 py-1.5 text-[11px] ${
            result.tone === "err"
              ? "border border-red-500/40 bg-red-950/40 text-red-100"
              : "border border-green-500/40 bg-green-950/40 text-green-100"
          }`}
        >
          {result.text}
        </div>
      ) : null}

      {standings?.ok && standings.pairs.length > 0 ? (
        <div className="mt-2 overflow-x-auto rounded border border-white/10 bg-black/20">
          <p className="border-b border-white/10 px-2 py-1 text-[10px] text-amber-100/80">
            Clasificación stroke agregado · R{standings.roundNo ?? "—"} · neto{" "}
            {standings.allowancePct}% HI
          </p>
          <table className="w-full text-left text-[11px]">
            <thead className="text-[9px] uppercase text-slate-500">
              <tr>
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Pareja</th>
                <th className="px-2 py-1 text-right">Total neto</th>
              </tr>
            </thead>
            <tbody>
              {standings.pairs.slice(0, 12).map((p) => (
                <tr key={p.pairId} className="border-t border-white/5">
                  <td className="px-2 py-0.5 font-bold text-white">
                    {p.position}
                    {p.tied ? "T" : ""}
                  </td>
                  <td className="px-2 py-0.5 text-slate-300">
                    {p.label}
                    <span className="block text-[9px] text-slate-500">
                      {p.playerA.name} / {p.playerB.name}
                    </span>
                  </td>
                  <td className="px-2 py-0.5 text-right font-bold tabular-nums text-sky-200">
                    {p.aggregateNet ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {standings.pairs.length > 12 ? (
            <p className="px-2 py-1 text-[9px] text-slate-500">
              +{standings.pairs.length - 12} más en la vista pública
            </p>
          ) : null}
        </div>
      ) : standings && !standings.ok ? (
        <p className="text-[10px] text-slate-500">{standings.message}</p>
      ) : null}
    </div>
  );
}
