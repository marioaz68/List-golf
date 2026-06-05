"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { StrokeAggregatePairRow } from "@/lib/matchplay/strokeAggregateStandings";

type StandingsPayload = {
  ok: boolean;
  tournamentName?: string;
  roundNo: number | null;
  allowancePct: number;
  pairs: StrokeAggregatePairRow[];
  message: string;
  error?: string;
};

function fmtScore(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return String(n);
}

function fmtToPar(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "";
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : String(n);
}

export default function StrokeAggregateStandingsView({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const [data, setData] = useState<StandingsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch(
        `/api/matchplay/stroke-aggregate-standings?tournament_id=${encodeURIComponent(
          tournamentId
        )}`,
        { cache: "no-store" }
      )
        .then((r) => r.json())
        .then((d: StandingsPayload) => {
          if (!cancelled) setData(d);
        })
        .catch(() => {
          if (!cancelled) setData({ ok: false, message: "Error de red", pairs: [], roundNo: null, allowancePct: 80 });
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    load();
    const poll = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [tournamentId]);

  if (loading && !data) {
    return (
      <p className="text-sm text-slate-400">Cargando clasificación…</p>
    );
  }

  if (!data?.ok) {
    return (
      <div className="rounded-lg border border-amber-500/40 bg-amber-950/30 p-4 text-sm text-amber-100">
        {data?.error ?? data?.message ?? "No disponible"}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-sky-500/30 bg-[#0c1728] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.28em] text-sky-300/80">
          Consolación · Stroke Play Agregado
        </div>
        <h1 className="mt-1 text-xl font-extrabold text-white sm:text-2xl">
          {data.tournamentName ?? "Torneo"}
        </h1>
        <p className="mt-2 text-[12px] text-slate-300">
          Ronda {data.roundNo ?? "—"} · Neto {data.allowancePct}% HI · Total =
          suma neto de los 2 jugadores de la pareja (perdedores R1, R2 y
          consolación MP).
        </p>
      </header>

      {data.pairs.length === 0 ? (
        <p className="rounded border border-white/10 bg-[#0c1728] p-4 text-sm text-slate-400">
          {data.message}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#0c1728]">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0a1220] text-[10px] uppercase tracking-wider text-slate-400">
              <tr>
                <th className="px-3 py-2">Pos</th>
                <th className="px-3 py-2">Pareja</th>
                <th className="px-3 py-2">Jugador</th>
                <th className="px-3 py-2 text-right">Neto</th>
                <th className="px-3 py-2 text-right">PH</th>
                <th className="px-3 py-2 text-right">Hoyos</th>
                <th className="px-3 py-2 text-right font-bold text-sky-200">
                  Total pareja
                </th>
              </tr>
            </thead>
            <tbody>
              {data.pairs.map((p) => (
                <PairTableRows key={p.pairId} pair={p} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-[11px]">
        <Link
          href={`/torneos/${tournamentId}/matches-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          📺 Matches en vivo
        </Link>
        <Link
          href={`/torneos/${tournamentId}/cuadro-vivo`}
          className="rounded border border-white/10 bg-white/5 px-3 py-1.5 text-slate-200 hover:bg-white/10"
        >
          🎯 Cuadro en vivo
        </Link>
      </div>
    </div>
  );
}

function PairTableRows({ pair }: { pair: StrokeAggregatePairRow }) {
  const totalLabel = fmtScore(pair.aggregateNet);
  const totalToPar = fmtToPar(pair.aggregateNetToPar);

  return (
    <>
      <tr className="border-b border-white/5 bg-white/[0.02]">
        <td
          className="px-3 py-2 align-top font-bold text-white"
          rowSpan={2}
        >
          {pair.position}
          {pair.tied ? (
            <span className="ml-0.5 text-[9px] text-slate-500">T</span>
          ) : null}
        </td>
        <td className="px-3 py-2 align-top font-semibold text-slate-200" rowSpan={2}>
          {pair.label}
          {pair.seed != null ? (
            <span className="ml-1 text-[10px] text-slate-500">#{pair.seed}</span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 text-slate-300">{pair.playerA.name}</td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
          {fmtScore(pair.playerA.net)}
          {pair.playerA.netToPar != null ? (
            <span className="ml-1 text-[10px] text-slate-500">
              ({fmtToPar(pair.playerA.netToPar)})
            </span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerA.playingHandicap}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerA.holesPlayed}/18
        </td>
        <td
          className="px-3 py-2 text-right align-middle text-lg font-extrabold tabular-nums text-sky-200"
          rowSpan={2}
        >
          {totalLabel}
          {totalToPar ? (
            <div className="text-[11px] font-normal text-slate-400">
              {totalToPar}
            </div>
          ) : null}
        </td>
      </tr>
      <tr className="border-b border-white/10">
        <td className="px-3 py-1.5 text-slate-300">{pair.playerB.name}</td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-200">
          {fmtScore(pair.playerB.net)}
          {pair.playerB.netToPar != null ? (
            <span className="ml-1 text-[10px] text-slate-500">
              ({fmtToPar(pair.playerB.netToPar)})
            </span>
          ) : null}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerB.playingHandicap}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
          {pair.playerB.holesPlayed}/18
        </td>
      </tr>
    </>
  );
}
