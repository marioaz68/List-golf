import { roundLabel } from "@/lib/matchplay/bracketUtils";
import { MATCHPLAY_PAIR_FORMAT_LABELS } from "@/lib/matchplay/types";
import type { PublicBracketView } from "@/lib/matchplay/loadPublicBracket";

function formatPts(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
}

type Labels = {
  empty: string;
  format: string;
  allowance: string;
  vs: string;
  holeDetail: string;
  lowBall: string;
  highBall: string;
  points: string;
  liveMarker: string;
  completed: string;
  bye: string;
};

export default function PublicMatchPlayBracket({
  bracket,
  labels,
}: {
  bracket: PublicBracketView;
  labels: Labels;
}) {
  const bracketSize = (bracket.config_json?.bracket_size as number) ?? 0;
  const formatLabel =
    MATCHPLAY_PAIR_FORMAT_LABELS[bracket.pair_format] ?? bracket.pair_format;

  const roundCount = bracket.rounds.length;
  // Cantidad de matches en R1 = base del grid (cada match ocupa 2 filas).
  const r1Count =
    bracket.rounds[0]?.matches.length || Math.max(1, bracketSize / 2);
  const gridRows = r1Count * 2; // 2 filas por match en R1

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-[#0c1728] px-4 py-3 text-sm text-slate-300">
        <p>
          <span className="font-semibold text-cyan-200">{labels.format}:</span>{" "}
          {formatLabel}
        </p>
        {bracket.pair_format === "low_high" && bracket.allowance_pct != null ? (
          <p className="mt-1">
            <span className="font-semibold text-cyan-200">{labels.allowance}:</span>{" "}
            {bracket.allowance_pct}%
          </p>
        ) : null}
      </div>

      {/* Leyenda colores (2 colores: arriba / abajo) */}
      <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-300">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-cyan-400" />
          Cuadro superior
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-violet-400" />
          Cuadro inferior
        </span>
      </div>

      {bracket.matches.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-400">
          {labels.empty}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="mx-auto flex justify-center">
            <div
              className="grid min-w-max gap-x-6"
              style={{
                gridTemplateColumns: `repeat(${roundCount}, minmax(220px, 260px))`,
                gridTemplateRows: `auto repeat(${gridRows}, minmax(28px, auto))`,
              }}
            >
              {/* Headers */}
              {bracket.rounds.map(({ roundNo, label }) => (
                <div
                  key={`hdr-${roundNo}`}
                  className="text-center text-[10px] font-bold uppercase tracking-[0.25em] text-cyan-300/80"
                  style={{ gridColumn: roundNo, gridRow: "1 / span 1" }}
                >
                  {label || roundLabel(roundNo, roundCount, bracketSize)}
                </div>
              ))}

              {/* Línea divisoria fina entre cuadro superior e inferior */}
              <div
                className="pointer-events-none self-end"
                style={{
                  gridColumn: `1 / span ${roundCount}`,
                  gridRow: `${gridRows / 2 + 1} / span 1`,
                }}
              >
                <div className="h-px w-full bg-gradient-to-r from-cyan-400/50 via-amber-400/40 to-violet-400/50" />
              </div>

              {/* Matches */}
              {bracket.rounds.map(({ roundNo, matches }) => {
                const span = Math.pow(2, roundNo);
                return matches.map((m, idx) => {
                  const rowStart = span * idx + 2;
                  const isFinal = roundNo === roundCount;
                  const half: "top" | "bottom" | "final" =
                    matches.length === 1
                      ? "final"
                      : idx < matches.length / 2
                        ? "top"
                        : "bottom";
                  return (
                    <PublicMatchCell
                      key={m.id}
                      match={m}
                      pairFormat={bracket.pair_format}
                      labels={labels}
                      round={roundNo}
                      rowStart={rowStart}
                      span={span}
                      half={half}
                      isFinal={isFinal}
                    />
                  );
                });
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PublicMatchCell({
  match,
  pairFormat,
  labels,
  round,
  rowStart,
  span,
  half,
  isFinal,
}: {
  match: PublicBracketView["matches"][number];
  pairFormat: PublicBracketView["pair_format"];
  labels: Labels;
  round: number;
  rowStart: number;
  span: number;
  half: "top" | "bottom" | "final";
  isFinal: boolean;
}) {
  const isBye = match.status === "bye";
  const isLive =
    !isBye &&
    match.status === "in_progress" &&
    (match.top_total_pts != null || match.result_text);

  const showTotals =
    pairFormat === "low_high" &&
    match.top_total_pts != null &&
    match.bottom_total_pts != null;

  // Cuadro de match: cada par enmarcado, fondo según mitad del bracket.
  // Superior = cian · Inferior = violeta · Final = ámbar.
  const cellBox = isBye
    ? "border-slate-600/40 bg-slate-900/40"
    : isFinal || half === "final"
      ? "border-amber-400/60 bg-amber-950/30 shadow-[0_0_20px_-8px_rgba(251,191,36,0.45)]"
      : half === "bottom"
        ? "border-violet-400/50 bg-violet-950/35"
        : "border-cyan-400/50 bg-cyan-950/35";

  const topWin = match.winner_label === match.top_label && !isBye;
  const botWin = match.winner_label === match.bottom_label && !isBye;

  return (
    <div
      className="relative flex flex-col justify-center self-center px-1"
      style={{
        gridColumn: round,
        gridRow: `${rowStart} / span ${span}`,
      }}
    >
      <div className={`rounded-lg border ${cellBox} px-2.5 py-1.5`}>
        {/* Fila superior */}
        <div
          className={`flex items-center justify-between gap-2 py-0.5 text-[12px] ${
            topWin
              ? "font-bold text-emerald-300"
              : isBye
                ? "text-slate-500"
                : "text-slate-100"
          }`}
        >
          <span className="truncate">{match.top_label}</span>
          {showTotals ? (
            <span className="shrink-0 text-amber-300/90">
              {formatPts(match.top_total_pts!)}
            </span>
          ) : null}
        </div>

        {/* Divisor horizontal entre top y bottom */}
        <div className="h-px bg-white/15" />

        {/* Fila inferior */}
        <div
          className={`flex items-center justify-between gap-2 py-0.5 text-[12px] ${
            botWin
              ? "font-bold text-emerald-300"
              : isBye
                ? "text-slate-500"
                : "text-slate-100"
          }`}
        >
          <span className="truncate">{match.bottom_label}</span>
          {showTotals ? (
            <span className="shrink-0 text-amber-300/90">
              {formatPts(match.bottom_total_pts!)}
            </span>
          ) : null}
        </div>

        {/* Estado / resultado: una sola línea pequeña */}
        {match.result_text ? (
          <p className="mt-0.5 text-center text-[10px] font-semibold text-emerald-300/90">
            {match.result_text}
          </p>
        ) : isLive ? (
          <p className="mt-0.5 text-center text-[9px] uppercase tracking-wider text-cyan-300/80">
            ● {labels.liveMarker}
          </p>
        ) : isBye ? (
          <p className="mt-0.5 text-center text-[9px] uppercase tracking-wider text-slate-500">
            {labels.bye}
          </p>
        ) : null}
      </div>

      {/* Detalle por hoyo (solo low/high) */}
      {pairFormat === "low_high" && match.holes.length > 0 ? (
        <details className="mt-1">
          <summary className="cursor-pointer select-none text-center text-[9px] uppercase tracking-wider text-cyan-300/70 hover:text-cyan-200">
            {labels.holeDetail} ({match.holes.length})
          </summary>
          <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-[9px] text-slate-400">
            {match.holes.map((h) => {
              const b = h.breakdown;
              return (
                <li
                  key={h.hole_no}
                  className="rounded border border-white/5 bg-black/20 px-1.5 py-0.5"
                >
                  <span className="font-semibold text-slate-300">
                    H{h.hole_no}
                  </span>
                  {h.top_points != null && h.bottom_points != null ? (
                    <span className="ml-1 text-amber-300/90">
                      {formatPts(h.top_points)}–{formatPts(h.bottom_points)}{" "}
                      {labels.points}
                    </span>
                  ) : null}
                  {b ? (
                    <div className="mt-0.5 leading-snug">
                      <div>
                        {match.top_label.split(" ")[0]}: {labels.lowBall}{" "}
                        {b.top.low} ({formatPts(b.top.low_pts)}) ·{" "}
                        {labels.highBall} {b.top.high} (
                        {formatPts(b.top.high_pts)})
                      </div>
                      <div>
                        {match.bottom_label.split(" ")[0]}: {labels.lowBall}{" "}
                        {b.bottom.low} ({formatPts(b.bottom.low_pts)}) ·{" "}
                        {labels.highBall} {b.bottom.high} (
                        {formatPts(b.bottom.high_pts)})
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
