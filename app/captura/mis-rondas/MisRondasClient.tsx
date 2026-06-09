"use client";

import { useMemo, useState } from "react";
import type { PlayerRoundSummary } from "@/lib/handicap/loadPlayerRounds";

interface Props {
  player: {
    id: string;
    fullName: string;
    gender: "M" | "F" | "X" | null;
  };
  rounds: PlayerRoundSummary[];
  hiInfo: { hi: number; usedCount: number; totalCount: number } | null;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const dt = new Date(iso + "T12:00:00");
  return dt.toLocaleDateString("es-MX", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function kindLabel(k: PlayerRoundSummary["tournamentKind"]): string {
  if (k === "daily_round") return "Ronda del día";
  if (k === "practice") return "Práctica";
  return "Torneo";
}

function kindChipColor(k: PlayerRoundSummary["tournamentKind"]) {
  if (k === "daily_round") return "bg-blue-900 text-blue-200";
  if (k === "practice") return "bg-slate-700 text-slate-200";
  return "bg-emerald-900 text-emerald-200";
}

export default function MisRondasClient({ player, rounds, hiInfo }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "competition" | "daily_round">(
    "all"
  );

  const filtered = useMemo(() => {
    if (filter === "all") return rounds;
    return rounds.filter((r) => r.tournamentKind === filter);
  }, [rounds, filter]);

  const stats = useMemo(() => {
    let bestGross = Infinity;
    let bestDiff = Infinity;
    let countLocked = 0;
    for (const r of rounds) {
      if (r.isLocked && r.grossScore != null && r.thru === 18) {
        if (r.grossScore < bestGross) bestGross = r.grossScore;
        countLocked++;
      }
      if (r.differential != null && r.differential < bestDiff) {
        bestDiff = r.differential;
      }
    }
    return {
      bestGross: bestGross === Infinity ? null : bestGross,
      bestDiff: bestDiff === Infinity ? null : bestDiff,
      countLocked,
    };
  }, [rounds]);

  return (
    <div className="min-h-screen bg-slate-950 pb-12 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900 px-4 py-4">
        <h1 className="text-base font-bold">⛳ Mis rondas</h1>
        <p className="mt-0.5 text-[13px] text-slate-300">{player.fullName}</p>
      </header>

      {/* HI + stats */}
      <section className="mx-3 mt-3 rounded-xl border-2 border-emerald-700 bg-gradient-to-br from-emerald-900/40 to-emerald-950/40 p-4">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
              Handicap Index · club
            </div>
            <div className="text-3xl font-black text-emerald-100">
              {hiInfo ? hiInfo.hi.toFixed(1) : "—"}
            </div>
            {hiInfo ? (
              <div className="text-[10px] text-emerald-300/80">
                Mejores {hiInfo.usedCount} de {hiInfo.totalCount} rondas
                cerradas
              </div>
            ) : (
              <div className="text-[10px] text-emerald-300/80">
                Necesitas al menos 3 rondas cerradas de 18 hoyos con tee
                certificado
              </div>
            )}
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase text-slate-500">
              Total rondas
            </div>
            <div className="text-xl font-bold text-slate-200">
              {rounds.length}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat
            label="Mejor gross"
            value={stats.bestGross != null ? String(stats.bestGross) : "—"}
          />
          <Stat
            label="Mejor diff"
            value={stats.bestDiff != null ? stats.bestDiff.toFixed(1) : "—"}
          />
          <Stat label="Cerradas" value={String(stats.countLocked)} />
        </div>
      </section>

      {/* Filtros */}
      <section className="mx-3 mt-3 flex gap-1">
        {(
          [
            ["all", "Todas"],
            ["competition", "Torneos"],
            ["daily_round", "Ronda del día"],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setFilter(v)}
            className={[
              "flex-1 rounded-md px-2 py-1.5 text-[12px] font-semibold",
              filter === v
                ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-slate-300",
            ].join(" ")}
          >
            {label}
          </button>
        ))}
      </section>

      {/* Lista */}
      <section className="mx-3 mt-3 space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-700 bg-slate-900 p-6 text-center text-sm text-slate-400">
            Aún no tienes rondas registradas con este filtro.
          </div>
        ) : (
          filtered.map((r) => (
            <RoundCard
              key={r.scorecardId}
              r={r}
              expanded={expandedId === r.scorecardId}
              onToggle={() =>
                setExpandedId(expandedId === r.scorecardId ? null : r.scorecardId)
              }
            />
          ))
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-900/60 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase text-slate-500">{label}</div>
      <div className="text-base font-bold text-slate-100">{value}</div>
    </div>
  );
}

function RoundCard({
  r,
  expanded,
  onToggle,
}: {
  r: PlayerRoundSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  const toParLabel =
    r.toPar == null ? null : r.toPar === 0 ? "E" : r.toPar > 0 ? `+${r.toPar}` : `${r.toPar}`;

  return (
    <article
      className={[
        "overflow-hidden rounded-lg border bg-slate-900",
        r.isLocked ? "border-slate-700" : "border-amber-700",
      ].join(" ")}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left active:bg-slate-800"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span
              className={[
                "rounded px-1.5 py-0.5 text-[9px] font-bold uppercase",
                kindChipColor(r.tournamentKind),
              ].join(" ")}
            >
              {kindLabel(r.tournamentKind)}
            </span>
            <span className="truncate text-[13px] font-bold text-slate-100">
              {r.tournamentName}
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline gap-2 text-[11px] text-slate-400">
            <span>{formatDate(r.playedAt)}</span>
            {r.teeName ? <span>· {r.teeName}</span> : null}
            {r.par != null ? <span>· par {r.par}</span> : null}
            {r.thru < 18 ? (
              <span className="text-amber-400">· thru {r.thru}</span>
            ) : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-emerald-300">
            {r.grossScore ?? "—"}
          </div>
          <div className="text-[11px] text-slate-400">
            {toParLabel ? (
              <span className="font-bold text-slate-300">{toParLabel}</span>
            ) : (
              "—"
            )}
            {r.differential != null ? (
              <span className="ml-1">
                · diff {r.differential.toFixed(1)}
              </span>
            ) : null}
          </div>
          {!r.isLocked ? (
            <span className="text-[9px] text-amber-400">tarjeta abierta</span>
          ) : null}
        </div>
      </button>

      {expanded ? (
        <div className="border-t border-slate-800 bg-slate-950 p-3">
          {r.holes.length === 0 ? (
            <p className="text-center text-[12px] text-slate-500">
              Sin captura hoyo por hoyo.
            </p>
          ) : (
            <HoleByHole holes={r.holes} />
          )}
          {r.slope != null && r.courseRating != null ? (
            <p className="mt-2 text-center text-[10px] text-slate-500">
              Slope {r.slope} · Rating {r.courseRating}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function HoleByHole({ holes }: { holes: { holeNo: number; strokes: number | null }[] }) {
  const front = holes.filter((h) => h.holeNo <= 9);
  const back = holes.filter((h) => h.holeNo > 9);
  const sumOf = (arr: typeof holes) =>
    arr.reduce((s, h) => (h.strokes != null ? s + h.strokes : s), 0);
  const renderRow = (label: string, arr: typeof holes) => (
    <tr>
      <td className="bg-slate-900 px-1 py-1 text-[9px] font-bold text-slate-400">
        {label}
      </td>
      {arr.map((h) => (
        <td
          key={h.holeNo}
          className="border border-slate-800 px-1 py-1 text-center text-[12px] font-bold text-slate-200"
        >
          {h.strokes ?? "—"}
        </td>
      ))}
      <td className="border border-slate-700 bg-slate-800 px-1.5 py-1 text-center text-[12px] font-bold text-emerald-300">
        {sumOf(arr)}
      </td>
    </tr>
  );

  return (
    <table className="w-full table-fixed border-collapse">
      <thead>
        <tr>
          <th className="bg-slate-900 px-1 py-1 text-[8px] uppercase text-slate-500">
            #
          </th>
          {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
            <th
              key={n}
              className="border border-slate-800 px-1 py-1 text-[9px] text-slate-500"
            >
              {n}
            </th>
          ))}
          <th className="border border-slate-700 bg-slate-800 px-1.5 py-1 text-[9px] font-bold text-slate-300">
            TOT
          </th>
        </tr>
      </thead>
      <tbody>
        {front.length > 0 ? renderRow("OUT", front) : null}
        {back.length > 0 ? (
          <>
            <tr>
              <th className="bg-slate-900 px-1 py-1 text-[8px] uppercase text-slate-500">
                #
              </th>
              {Array.from({ length: 9 }, (_, i) => i + 10).map((n) => (
                <th
                  key={n}
                  className="border border-slate-800 px-1 py-1 text-[9px] text-slate-500"
                >
                  {n}
                </th>
              ))}
              <th className="border border-slate-700 bg-slate-800 px-1.5 py-1 text-[9px] font-bold text-slate-300">
                TOT
              </th>
            </tr>
            {renderRow("IN", back)}
          </>
        ) : null}
      </tbody>
    </table>
  );
}
