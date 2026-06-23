"use client";

import { useMemo, useState } from "react";
import {
  computeRoundYardageStats,
  formatPct,
  formatToPar,
  type HoleYardageStats,
  type ParByHole,
  type RoundYardageStats,
} from "@/lib/distances/yardageStats";
import type { HoleShotsStore } from "@/lib/distances/holeShots";

type Tab = "resumen" | "hoyos";

interface YardageStatsSheetProps {
  open: boolean;
  store: HoleShotsStore;
  pars?: ParByHole;
  onClose: () => void;
}

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/40 px-2.5 py-2 text-center">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </p>
      <p className="text-lg font-black tabular-nums text-white">{value}</p>
      {sub ? (
        <p className="text-[9px] font-medium text-slate-500">{sub}</p>
      ) : null}
    </div>
  );
}

function boolCell(v: boolean | null): string {
  if (v == null) return "—";
  return v ? "✓" : "·";
}

function HoleRow({ h }: { h: HoleYardageStats }) {
  if (!h.played) {
    return (
      <tr className="text-slate-600">
        <td className="px-1.5 py-1 font-bold">H{h.hole}</td>
        <td className="px-1 py-1 text-center">{h.par}</td>
        <td colSpan={7} className="px-1 py-1 text-center text-[10px]">
          —
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={
        h.finished
          ? "text-white"
          : "text-slate-300"
      }
    >
      <td className="px-1.5 py-1 font-bold">
        H{h.hole}
        {h.finished ? "" : " *"}
      </td>
      <td className="px-1 py-1 text-center tabular-nums">{h.par}</td>
      <td className="px-1 py-1 text-center font-bold tabular-nums">
        {h.score || "—"}
      </td>
      <td className="px-1 py-1 text-center tabular-nums text-amber-200/90">
        {formatToPar(h.toPar)}
      </td>
      <td className="px-1 py-1 text-center tabular-nums">{h.putts || "—"}</td>
      <td className="px-1 py-1 text-center">{boolCell(h.gir)}</td>
      <td className="px-1 py-1 text-center">{boolCell(h.fairwayHit)}</td>
      <td className="px-1 py-1 text-center">{boolCell(h.scramble)}</td>
      <td className="px-1 py-1 text-center tabular-nums text-sky-300/90">
        {h.drivingYards ?? "—"}
      </td>
    </tr>
  );
}

function SummaryPanel({ stats }: { stats: RoundYardageStats }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Score"
          value={String(stats.totalScore)}
          sub={formatToPar(stats.toPar)}
        />
        <StatCard label="Putts" value={String(stats.totalPutts)} />
        <StatCard
          label="GIR"
          value={`${stats.girCount}/${stats.girPossible}`}
          sub={formatPct(stats.girPct)}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="Fairways"
          value={`${stats.fairwaysHit}/${stats.fairwaysPossible}`}
          sub={formatPct(stats.fairwayPct)}
        />
        <StatCard
          label="Scramble"
          value={`${stats.scrambles}/${stats.scrambleOpportunities}`}
          sub={formatPct(stats.scramblePct)}
        />
        <StatCard
          label="Sand save"
          value={`${stats.sandSaves}/${stats.sandSaveOpportunities}`}
          sub={formatPct(stats.sandSavePct)}
        />
        <StatCard
          label="PGR"
          value={
            stats.puttsPerGir != null ? String(stats.puttsPerGir) : "—"
          }
          sub="putts / GIR"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatCard
          label="Birdies+"
          value={String(stats.birdiesOrBetter)}
        />
        <StatCard label="One putts" value={String(stats.onePutts)} />
        <StatCard
          label="Drive avg"
          value={
            stats.avgDrivingYards != null
              ? `${stats.avgDrivingYards} yd`
              : "—"
          }
        />
      </div>

      {stats.avgPlannedVsActual != null ? (
        <div className="rounded-lg border border-sky-500/30 bg-sky-950/40 px-3 py-2 text-center">
          <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-300/80">
            Plan vs real (promedio)
          </p>
          <p className="text-base font-black tabular-nums text-sky-100">
            {stats.avgPlannedVsActual >= 0 ? "+" : ""}
            {stats.avgPlannedVsActual} yd
          </p>
        </div>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2">
        <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
          Vueltas
        </p>
        <div className="mt-1 flex justify-between text-sm font-bold text-white">
          <span>
            1ª: {stats.strokeTotals.firstNine} golpes
          </span>
          <span>
            2ª: {stats.strokeTotals.secondNine} golpes
          </span>
        </div>
        <p className="mt-1 text-center text-xs text-slate-400">
          {stats.holesPlayed} hoyos con datos · {stats.holesFinished} cerrados
        </p>
      </div>
    </div>
  );
}

export function YardageStatsSheet({
  open,
  store,
  pars,
  onClose,
}: YardageStatsSheetProps) {
  const [tab, setTab] = useState<Tab>("resumen");

  const stats = useMemo(
    () => computeRoundYardageStats(store, pars),
    [store, pars]
  );

  if (!open) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[1200] flex flex-col bg-slate-950/98 backdrop-blur-md">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-black text-white">Estadísticas Yardas</h2>
          <p className="text-[10px] text-slate-400">
            Estilo Golf Genius · desde tus golpes GPS
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/20 bg-black/50 px-3 py-1 text-xs font-bold text-white"
        >
          Cerrar
        </button>
      </header>

      <div className="flex shrink-0 gap-1 border-b border-slate-800 px-3 py-2">
        {(
          [
            ["resumen", "Resumen"],
            ["hoyos", "Por hoyo"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={[
              "flex-1 rounded-lg py-1.5 text-[11px] font-black",
              tab === id
                ? "bg-emerald-600 text-white"
                : "bg-slate-900 text-slate-400",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {stats.holesPlayed === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            Aún no hay golpes registrados. Marca salida y anota golpes para ver
            estadísticas.
          </p>
        ) : tab === "resumen" ? (
          <SummaryPanel stats={stats} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[320px] border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-slate-700 text-slate-400">
                  <th className="px-1.5 py-1 text-left">Hoyo</th>
                  <th className="px-1 py-1">Par</th>
                  <th className="px-1 py-1">Scr</th>
                  <th className="px-1 py-1">+/-</th>
                  <th className="px-1 py-1">P</th>
                  <th className="px-1 py-1">GIR</th>
                  <th className="px-1 py-1">FH</th>
                  <th className="px-1 py-1">Sc</th>
                  <th className="px-1 py-1">Drv</th>
                </tr>
              </thead>
              <tbody>
                {stats.byHole.map((h) => (
                  <HoleRow key={h.hole} h={h} />
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[9px] text-slate-500">
              * hoyo en juego · GIR = green in regulation · FH = fairway hit ·
              Sc = scramble · Drv = yardas salida (par 4/5)
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** Bloque compacto para el modal de ronda terminada. */
export function YardageStatsSummaryCompact({
  stats,
}: {
  stats: RoundYardageStats;
}) {
  return (
    <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Estadísticas de la ronda
      </p>
      <div className="grid grid-cols-2 gap-1.5 text-center text-[10px]">
        <div className="rounded-md bg-black/40 px-2 py-1.5">
          <span className="text-slate-400">Putts </span>
          <span className="font-black text-white">{stats.totalPutts}</span>
        </div>
        <div className="rounded-md bg-black/40 px-2 py-1.5">
          <span className="text-slate-400">GIR </span>
          <span className="font-black text-white">
            {stats.girCount}/{stats.girPossible}
          </span>
        </div>
        <div className="rounded-md bg-black/40 px-2 py-1.5">
          <span className="text-slate-400">FH </span>
          <span className="font-black text-white">
            {stats.fairwaysHit}/{stats.fairwaysPossible}
          </span>
        </div>
        <div className="rounded-md bg-black/40 px-2 py-1.5">
          <span className="text-slate-400">Birdies+ </span>
          <span className="font-black text-emerald-300">
            {stats.birdiesOrBetter}
          </span>
        </div>
      </div>
    </div>
  );
}
