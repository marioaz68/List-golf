import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import type { LeaderboardRow, RoundDetail } from "../lib/types";
import type { PublicDetailTableLabels } from "../lib/publicDetailTableLabels";
import {
  collectRoundIdsWithScoreCapture,
  resolveDetailForSelectedRound,
} from "@/lib/leaderboard/roundCategoryMatch";
import {
  formatRelativeOrDQ,
  formatScore,
  formatScoreOrDQ,
  scoreMarker,
  selectLeaderboardDetailsForPlayer,
  subtotal,
  type SelectedRoundMeta,
} from "../lib/utils";

function hasHoleOrGross(detail: RoundDetail) {
  return (
    detail.is_dq ||
    detail.gross_score != null ||
    detail.holes.some((hole) => hole.strokes != null)
  );
}

function getDisplayDetails({
  row,
  selectedRound,
}: {
  row: LeaderboardRow;
  selectedRound: SelectedRoundMeta | null;
}) {
  if (selectedRound?.id) {
    const selectedDetail = resolveDetailForSelectedRound(
      row.details,
      selectedRound,
      row.category_id,
      collectRoundIdsWithScoreCapture(row.details)
    );

    if (selectedDetail) {
      return [selectedDetail];
    }
  }

  return selectLeaderboardDetailsForPlayer(row).filter(hasHoleOrGross);
}

const stickyLabelBase =
  "sticky left-0 border-b border-r border-white/10 shadow-[6px_0_14px_-6px_rgba(0,0,0,0.55)]";

function ThNineCol({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <th className="w-[56px] border-b border-white/10 px-1 py-1.5 text-center font-semibold leading-tight">
      <span className="block text-[11px] font-bold text-cyan-50">{title}</span>
      {subtitle ? (
        <span className="mt-0.5 block whitespace-normal text-[8.5px] font-semibold leading-snug text-cyan-200/90">
          {subtitle}
        </span>
      ) : null}
    </th>
  );
}

function GrossToParPosHeads({ labels }: { labels: PublicDetailTableLabels }) {
  return (
    <>
      <th className="w-[52px] border-b border-white/10 px-1 py-2 text-center font-semibold">
        {labels.gross}
      </th>
      <th className="w-[64px] border-b border-white/10 px-1 py-2 text-center font-semibold">
        {labels.toPar}
      </th>
      <th className="w-[44px] border-b border-white/10 px-1 py-2 text-center font-semibold">
        {labels.pos}
      </th>
    </>
  );
}

export default function PublicLeaderboardDetailTable({
  row,
  selectedRound,
  labels,
}: {
  row: LeaderboardRow;
  selectedRound: SelectedRoundMeta | null;
  labels: PublicDetailTableLabels;
}) {
  const displayDetails = getDisplayDetails({ row, selectedRound });

  const baseRound =
    displayDetails.find((detail) =>
      detail.holes.some((hole) => hole.par != null)
    ) ??
    row.details.find((detail) => detail.holes.some((hole) => hole.par != null)) ??
    row.details[0] ??
    null;

  const baseHoles = baseRound?.holes ?? [];

  const inline = labels.detailTotalsPlacement === "inline-after-nines";
  const emptyColSpan = inline ? 24 : 25;
  const tableMinW = inline ? "min-w-[900px]" : "min-w-[960px]";

  return (
    <div className="mx-auto mt-2 w-full max-w-full overflow-x-auto rounded-[24px] border border-white/10 bg-[#08111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300">
        <ClubLogoThumb
          clubId={row.club_id}
          size={28}
          title={row.club_label ?? undefined}
        />
        <div className="min-w-0">
          {row.player_code}
          {row.club_label ? ` • ${row.club_label}` : ""}
          {row.category_code ? ` • ${row.category_code}` : ""}
          {row.is_disqualified ? ` • DQ` : ""}
        </div>
      </div>

      <table
        className={`w-full ${tableMinW} border-separate border-spacing-0 text-[10px] text-white sm:text-[11px]`}
      >
        <thead>
          <tr className="bg-gradient-to-r from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50">
            <th
              className={`${stickyLabelBase} z-20 w-[70px] min-w-[70px] bg-cyan-950 px-2 py-2 text-left font-semibold`}
            >
              {labels.holesCol}
            </th>

            {inline ? (
              <>
                {Array.from({ length: 9 }, (_, i) => (
                  <th
                    key={`hdr-${row.entry_id}-${i + 1}`}
                    className="w-[34px] whitespace-nowrap border-b border-white/10 px-1 py-2 text-center font-semibold"
                  >
                    {i + 1}
                  </th>
                ))}
                <ThNineCol title={labels.firstNineTitle} subtitle={labels.firstNineSub} />
                {Array.from({ length: 9 }, (_, i) => (
                  <th
                    key={`hdr-${row.entry_id}-${i + 10}`}
                    className="w-[34px] whitespace-nowrap border-b border-white/10 px-1 py-2 text-center font-semibold"
                  >
                    {i + 10}
                  </th>
                ))}
                <ThNineCol title={labels.secondNineTitle} subtitle={labels.secondNineSub} />
                <GrossToParPosHeads labels={labels} />
              </>
            ) : (
              <>
                {Array.from({ length: 18 }, (_, i) => (
                  <th
                    key={`hdr-${row.entry_id}-${i + 1}`}
                    className="w-[34px] whitespace-nowrap border-b border-white/10 px-1 py-2 text-center font-semibold"
                  >
                    {i + 1}
                  </th>
                ))}
                <ThNineCol title={labels.firstNineTitle} subtitle={labels.firstNineSub} />
                <ThNineCol title={labels.secondNineTitle} subtitle={labels.secondNineSub} />
                <ThNineCol title={labels.totalTitle} subtitle={labels.totalSub} />
                <GrossToParPosHeads labels={labels} />
              </>
            )}
          </tr>
        </thead>

        <tbody>
          <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
            <td
              className={`${stickyLabelBase} z-20 w-[70px] min-w-[70px] bg-emerald-950 px-2 py-2 font-semibold`}
            >
              {labels.parRow}
            </td>

            {inline ? (
              <>
                {Array.from({ length: 9 }, (_, i) => {
                  const hole = baseHoles[i];
                  return (
                    <td
                      key={`par-${row.entry_id}-${i + 1}`}
                      className="border-b border-white/10 px-1 py-2 text-center font-semibold"
                    >
                      {formatScore(hole?.par ?? null)}
                    </td>
                  );
                })}
                <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
                  {formatScore(subtotal(baseHoles, 0, 9, "par"))}
                </td>
                {Array.from({ length: 9 }, (_, i) => {
                  const hole = baseHoles[i + 9];
                  return (
                    <td
                      key={`par-${row.entry_id}-${i + 10}`}
                      className="border-b border-white/10 px-1 py-2 text-center font-semibold"
                    >
                      {formatScore(hole?.par ?? null)}
                    </td>
                  );
                })}
                <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
                  {formatScore(subtotal(baseHoles, 9, 18, "par"))}
                </td>
                <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
                <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
                <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
              </>
            ) : (
              <>
                {Array.from({ length: 18 }, (_, i) => {
                  const hole = baseHoles[i];
                  return (
                    <td
                      key={`par-${row.entry_id}-${i + 1}`}
                      className="border-b border-white/10 px-1 py-2 text-center font-semibold"
                    >
                      {formatScore(hole?.par ?? null)}
                    </td>
                  );
                })}
                <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
                  {formatScore(subtotal(baseHoles, 0, 9, "par"))}
                </td>
                <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
                  {formatScore(subtotal(baseHoles, 9, 18, "par"))}
                </td>
                <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
                  {formatScore(subtotal(baseHoles, 0, 18, "par"))}
                </td>
                <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
                <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
                <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
              </>
            )}
          </tr>

          {displayDetails.length === 0 ? (
            <tr>
              <td
                colSpan={emptyColSpan}
                className="border-b border-white/10 px-3 py-5 text-center text-xs text-slate-400"
              >
                {labels.noCapture}
              </td>
            </tr>
          ) : (
            displayDetails.map((detail, detailIndex) => {
              const standing =
                row.standing_by_round_category.find(
                  (s) => s.round_id === detail.round_id
                ) ??
                row.standing_by_round.find((s) => s.round_id === detail.round_id) ??
                null;

              const stripeBg =
                detailIndex % 2 === 0 ? "bg-[#0c1928]" : "bg-[#0b1728]";

              return (
                <tr
                  key={`detail-${row.entry_id}-${detail.round_id}`}
                  className={
                    detailIndex % 2 === 0
                      ? "bg-white/[0.03] text-white"
                      : "bg-[#0b1728] text-white"
                  }
                >
                  <td
                    className={`${stickyLabelBase} z-10 w-[70px] min-w-[70px] px-2 py-1.5 font-semibold text-cyan-100 ${stripeBg}`}
                  >
                    R{detail.round_no}
                  </td>

                  {inline ? (
                    <>
                      {detail.holes.slice(0, 9).map((hole) => {
                        const marker = scoreMarker(hole.strokes, hole.par);
                        return (
                          <td
                            key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                            className="border-b border-white/10 px-1 py-1 text-center"
                          >
                            <span className={marker.wrapper}>
                              {marker.outer ? (
                                <span aria-hidden className={marker.outer} />
                              ) : null}
                              {marker.inner ? (
                                <span aria-hidden className={marker.inner} />
                              ) : null}
                              <span
                                className={`relative z-10 text-[10px] font-semibold ${marker.textClass}`}
                              >
                                {formatScore(hole.strokes)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                        {detail.is_dq ? "DQ" : formatScore(detail.out_score)}
                      </td>
                      {detail.holes.slice(9, 18).map((hole) => {
                        const marker = scoreMarker(hole.strokes, hole.par);
                        return (
                          <td
                            key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                            className="border-b border-white/10 px-1 py-1 text-center"
                          >
                            <span className={marker.wrapper}>
                              {marker.outer ? (
                                <span aria-hidden className={marker.outer} />
                              ) : null}
                              {marker.inner ? (
                                <span aria-hidden className={marker.inner} />
                              ) : null}
                              <span
                                className={`relative z-10 text-[10px] font-semibold ${marker.textClass}`}
                              >
                                {formatScore(hole.strokes)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                        {detail.is_dq ? "DQ" : formatScore(detail.in_score)}
                      </td>
                    </>
                  ) : (
                    <>
                      {detail.holes.map((hole) => {
                        const marker = scoreMarker(hole.strokes, hole.par);

                        return (
                          <td
                            key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                            className="border-b border-white/10 px-1 py-1 text-center"
                          >
                            <span className={marker.wrapper}>
                              {marker.outer ? (
                                <span aria-hidden className={marker.outer} />
                              ) : null}
                              {marker.inner ? (
                                <span aria-hidden className={marker.inner} />
                              ) : null}
                              <span
                                className={`relative z-10 text-[10px] font-semibold ${marker.textClass}`}
                              >
                                {formatScore(hole.strokes)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                        {detail.is_dq ? "DQ" : formatScore(detail.out_score)}
                      </td>
                      <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                        {detail.is_dq ? "DQ" : formatScore(detail.in_score)}
                      </td>
                      <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                        {detail.is_dq ? "DQ" : formatScore(detail.total_score)}
                      </td>
                    </>
                  )}

                  <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                    {formatScoreOrDQ(detail.gross_score, detail.is_dq)}
                  </td>
                  <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                    {formatRelativeOrDQ(detail.to_par, detail.is_dq)}
                  </td>
                  <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                    {detail.is_dq ? "DQ" : standing?.pos ?? "—"}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
