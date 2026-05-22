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

  return (
    <div className="space-y-4">
      <div className="rounded-[28px] border border-white/10 bg-[#0c1728] px-4 py-3 text-sm text-slate-300">
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

      {bracket.matches.length === 0 ? (
        <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-6 text-center text-sm text-slate-400">
          {labels.empty}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex min-w-max gap-4">
            {bracket.rounds.map(({ roundNo, label, matches }) => (
              <div
                key={roundNo}
                className="w-[min(280px,85vw)] shrink-0 rounded-2xl border border-white/10 bg-[#0c1728] p-3"
              >
                <h3 className="mb-3 border-b border-white/10 pb-2 text-center text-xs font-bold uppercase tracking-wide text-cyan-300">
                  {label ||
                    roundLabel(roundNo, bracket.roundCount, bracketSize)}
                </h3>
                <div className="space-y-3">
                  {matches.map((m) => (
                    <PublicMatchCard
                      key={m.id}
                      match={m}
                      pairFormat={bracket.pair_format}
                      labels={labels}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PublicMatchCard({
  match,
  pairFormat,
  labels,
}: {
  match: PublicBracketView["matches"][number];
  pairFormat: PublicBracketView["pair_format"];
  labels: Labels;
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

  return (
    <article
      className={`rounded-xl border px-3 py-2 text-[11px] ${
        isBye
          ? "border-slate-600/40 bg-slate-900/40 text-slate-500"
          : "border-white/15 bg-[#111827] text-slate-200"
      }`}
    >
      <div
        className={
          match.winner_label === match.top_label
            ? "font-semibold text-emerald-300"
            : ""
        }
      >
        {match.top_label}
        {showTotals ? (
          <span className="ml-1 text-amber-300/90">
            ({formatPts(match.top_total_pts!)})
          </span>
        ) : null}
      </div>
      <div className="my-1 text-center text-[10px] text-slate-500">{labels.vs}</div>
      <div
        className={
          match.winner_label === match.bottom_label
            ? "font-semibold text-emerald-300"
            : ""
        }
      >
        {match.bottom_label}
        {showTotals ? (
          <span className="ml-1 text-amber-300/90">
            ({formatPts(match.bottom_total_pts!)})
          </span>
        ) : null}
      </div>

      {match.result_text ? (
        <p className="mt-2 text-center text-[10px] font-medium text-amber-300/90">
          {match.result_text}
        </p>
      ) : null}

      {isLive ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-wide text-cyan-400/80">
          {labels.liveMarker}
        </p>
      ) : null}

      {match.status === "completed" && !isBye ? (
        <p className="mt-1 text-center text-[9px] text-emerald-400/70">
          {labels.completed}
        </p>
      ) : null}

      {isBye ? (
        <p className="mt-1 text-center text-[9px]">{labels.bye}</p>
      ) : null}

      {pairFormat === "low_high" && match.holes.length > 0 ? (
        <details className="mt-2 border-t border-white/10 pt-2">
          <summary className="cursor-pointer select-none text-[10px] font-semibold text-cyan-300 hover:text-cyan-200">
            {labels.holeDetail} ({match.holes.length})
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-[9px] text-slate-400">
            {match.holes.map((h) => {
              const b = h.breakdown;
              return (
                <li
                  key={h.hole_no}
                  className="rounded border border-white/5 bg-black/20 px-1.5 py-1"
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
                        {b.top.low} ({formatPts(b.top.low_pts)}) · {labels.highBall}{" "}
                        {b.top.high} ({formatPts(b.top.high_pts)})
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
    </article>
  );
}
