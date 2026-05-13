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
  "sticky left-0 z-10 border-b border-r border-white/10 shadow-[6px_0_12px_-4px_rgba(0,0,0,0.45)]";

const holeNumTh =
  "w-[22px] min-w-[22px] max-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[8px] font-semibold leading-none text-cyan-50/95 sm:w-6 sm:min-w-[24px] sm:max-w-[24px] sm:text-[9px]";

const holeDataTd =
  "w-[22px] min-w-[22px] max-w-[22px] border-b border-white/10 px-0 py-0.5 text-center align-middle sm:w-6 sm:min-w-[24px] sm:max-w-[24px]";

const parTd =
  "w-[22px] min-w-[22px] max-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[8px] font-semibold leading-none sm:w-6 sm:min-w-[24px] sm:max-w-[24px] sm:text-[9px]";

const totalTd =
  "border-b border-white/10 px-0.5 py-0.5 text-center text-[8px] font-semibold leading-none sm:text-[9px]";

function ThNineCol({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  const sub = subtitle?.trim();
  return (
    <th className="w-[34px] min-w-[32px] max-w-[42px] border-b border-white/10 px-0.5 py-0.5 text-center align-bottom sm:w-[38px] sm:max-w-[44px]">
      <span className="block truncate text-center text-[9px] font-bold leading-none text-cyan-50 sm:text-[10px]">
        {title}
      </span>
      {sub ? (
        <span className="mt-0.5 block truncate text-[6px] font-semibold leading-tight text-cyan-200/80 sm:text-[7px]">
          {sub}
        </span>
      ) : null}
    </th>
  );
}

function GrossToParPosHeads({ labels }: { labels: PublicDetailTableLabels }) {
  return (
    <>
      <th className="w-[24px] min-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[26px] sm:text-[8px]">
        {labels.gross}
      </th>
      <th className="w-[24px] min-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[26px] sm:text-[8px]">
        {labels.toPar}
      </th>
      <th className="w-[20px] min-w-[18px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[22px] sm:text-[8px]">
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
  const showEighteenTotalCol =
    !inline && Boolean(labels.totalTitle?.trim());
  const emptyColSpan = inline ? 24 : showEighteenTotalCol ? 25 : 24;
  const tableMinW = inline ? "min-w-[540px]" : "min-w-[580px]";

  const stickyHead =
    `${stickyLabelBase} z-20 w-[40px] min-w-[40px] max-w-[44px] bg-cyan-950 px-1 py-0.5 text-left text-[8px] font-semibold leading-tight sm:w-[44px] sm:min-w-[44px] sm:text-[9px]`;

  const stickyPar =
    `${stickyLabelBase} z-20 w-[40px] min-w-[40px] max-w-[44px] bg-emerald-950 px-1 py-0.5 text-left text-[8px] font-semibold leading-tight sm:w-[44px] sm:min-w-[44px] sm:text-[9px]`;

  const stickyRound = (stripeBg: string) =>
    `${stickyLabelBase} w-[40px] min-w-[40px] max-w-[44px] px-1 py-0.5 text-left text-[8px] font-semibold leading-tight text-cyan-100 sm:w-[44px] sm:min-w-[44px] sm:text-[9px] ${stripeBg}`;

  return (
    <div className="mt-1.5 w-full min-w-0 overflow-x-auto rounded-xl border border-white/10 bg-[#08111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] [-webkit-overflow-scrolling:touch]">
      <div className="flex min-w-0 items-center gap-1.5 border-b border-white/10 bg-white/[0.03] px-2 py-1 text-[9px] font-semibold text-slate-300 sm:text-[10px]">
        <ClubLogoThumb
          clubId={row.club_id}
          size={20}
          title={row.club_label ?? undefined}
        />
        <div className="min-w-0 truncate">
          {row.player_code}
          {row.club_label ? ` · ${row.club_label}` : ""}
          {row.category_code ? ` · ${row.category_code}` : ""}
          {row.is_disqualified ? ` · DQ` : ""}
        </div>
      </div>

      <table
        className={`w-full ${tableMinW} border-separate border-spacing-0 text-[9px] text-white sm:text-[10px]`}
      >
        <thead>
          <tr className="bg-gradient-to-r from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50">
            <th className={stickyHead}>{labels.holesCol}</th>

            {inline ? (
              <>
                {Array.from({ length: 9 }, (_, i) => (
                  <th
                    key={`hdr-${row.entry_id}-${i + 1}`}
                    className={holeNumTh}
                  >
                    {i + 1}
                  </th>
                ))}
                <ThNineCol title={labels.firstNineTitle} subtitle={labels.firstNineSub} />
                {Array.from({ length: 9 }, (_, i) => (
                  <th
                    key={`hdr-${row.entry_id}-${i + 10}`}
                    className={holeNumTh}
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
                    className={holeNumTh}
                  >
                    {i + 1}
                  </th>
                ))}
                <ThNineCol title={labels.firstNineTitle} subtitle={labels.firstNineSub} />
                <ThNineCol title={labels.secondNineTitle} subtitle={labels.secondNineSub} />
                {showEighteenTotalCol ? (
                  <ThNineCol title={labels.totalTitle} subtitle={labels.totalSub} />
                ) : null}
                <GrossToParPosHeads labels={labels} />
              </>
            )}
          </tr>
        </thead>

        <tbody>
          <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
            <td className={stickyPar}>{labels.parRow}</td>

            {inline ? (
              <>
                {Array.from({ length: 9 }, (_, i) => {
                  const hole = baseHoles[i];
                  return (
                    <td
                      key={`par-${row.entry_id}-${i + 1}`}
                      className={`${parTd} bg-emerald-950/90`}
                    >
                      {formatScore(hole?.par ?? null)}
                    </td>
                  );
                })}
                <td className={`${totalTd} bg-emerald-950/90`}>
                  {formatScore(subtotal(baseHoles, 0, 9, "par"))}
                </td>
                {Array.from({ length: 9 }, (_, i) => {
                  const hole = baseHoles[i + 9];
                  return (
                    <td
                      key={`par-${row.entry_id}-${i + 10}`}
                      className={`${parTd} bg-emerald-950/90`}
                    >
                      {formatScore(hole?.par ?? null)}
                    </td>
                  );
                })}
                <td className={`${totalTd} bg-emerald-950/90`}>
                  {formatScore(subtotal(baseHoles, 9, 18, "par"))}
                </td>
                <td className={`${totalTd} bg-emerald-950/90`}>—</td>
                <td className={`${totalTd} bg-emerald-950/90`}>—</td>
                <td className={`${totalTd} bg-emerald-950/90`}>—</td>
              </>
            ) : (
              <>
                {Array.from({ length: 18 }, (_, i) => {
                  const hole = baseHoles[i];
                  return (
                    <td
                      key={`par-${row.entry_id}-${i + 1}`}
                      className={`${parTd} bg-emerald-950/90`}
                    >
                      {formatScore(hole?.par ?? null)}
                    </td>
                  );
                })}
                <td className={`${totalTd} bg-emerald-950/90`}>
                  {formatScore(subtotal(baseHoles, 0, 9, "par"))}
                </td>
                <td className={`${totalTd} bg-emerald-950/90`}>
                  {formatScore(subtotal(baseHoles, 9, 18, "par"))}
                </td>
                {showEighteenTotalCol ? (
                  <td className={`${totalTd} bg-emerald-950/90`}>
                    {formatScore(subtotal(baseHoles, 0, 18, "par"))}
                  </td>
                ) : null}
                <td className={`${totalTd} bg-emerald-950/90`}>—</td>
                <td className={`${totalTd} bg-emerald-950/90`}>—</td>
                <td className={`${totalTd} bg-emerald-950/90`}>—</td>
              </>
            )}
          </tr>

          {displayDetails.length === 0 ? (
            <tr>
              <td
                colSpan={emptyColSpan}
                className="border-b border-white/10 px-2 py-3 text-center text-[9px] text-slate-400 sm:text-[10px]"
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
                  <td className={stickyRound(stripeBg)}>R{detail.round_no}</td>

                  {inline ? (
                    <>
                      {detail.holes.slice(0, 9).map((hole) => {
                        const marker = scoreMarker(hole.strokes, hole.par, {
                          compact: true,
                        });
                        return (
                          <td
                            key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                            className={`${holeDataTd} ${stripeBg}`}
                          >
                            <span className={marker.wrapper}>
                              {marker.outer ? (
                                <span aria-hidden className={marker.outer} />
                              ) : null}
                              {marker.inner ? (
                                <span aria-hidden className={marker.inner} />
                              ) : null}
                              <span className={marker.textClass}>
                                {formatScore(hole.strokes)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className={`${totalTd} ${stripeBg}`}>
                        {detail.is_dq ? "DQ" : formatScore(detail.out_score)}
                      </td>
                      {detail.holes.slice(9, 18).map((hole) => {
                        const marker = scoreMarker(hole.strokes, hole.par, {
                          compact: true,
                        });
                        return (
                          <td
                            key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                            className={`${holeDataTd} ${stripeBg}`}
                          >
                            <span className={marker.wrapper}>
                              {marker.outer ? (
                                <span aria-hidden className={marker.outer} />
                              ) : null}
                              {marker.inner ? (
                                <span aria-hidden className={marker.inner} />
                              ) : null}
                              <span className={marker.textClass}>
                                {formatScore(hole.strokes)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className={`${totalTd} ${stripeBg}`}>
                        {detail.is_dq ? "DQ" : formatScore(detail.in_score)}
                      </td>
                    </>
                  ) : (
                    <>
                      {detail.holes.map((hole) => {
                        const marker = scoreMarker(hole.strokes, hole.par, {
                          compact: true,
                        });

                        return (
                          <td
                            key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                            className={`${holeDataTd} ${stripeBg}`}
                          >
                            <span className={marker.wrapper}>
                              {marker.outer ? (
                                <span aria-hidden className={marker.outer} />
                              ) : null}
                              {marker.inner ? (
                                <span aria-hidden className={marker.inner} />
                              ) : null}
                              <span className={marker.textClass}>
                                {formatScore(hole.strokes)}
                              </span>
                            </span>
                          </td>
                        );
                      })}
                      <td className={`${totalTd} ${stripeBg}`}>
                        {detail.is_dq ? "DQ" : formatScore(detail.out_score)}
                      </td>
                      <td className={`${totalTd} ${stripeBg}`}>
                        {detail.is_dq ? "DQ" : formatScore(detail.in_score)}
                      </td>
                      {showEighteenTotalCol ? (
                        <td className={`${totalTd} ${stripeBg}`}>
                          {detail.is_dq ? "DQ" : formatScore(detail.total_score)}
                        </td>
                      ) : null}
                    </>
                  )}

                  <td className={`${totalTd} ${stripeBg}`}>
                    {formatScoreOrDQ(detail.gross_score, detail.is_dq)}
                  </td>
                  <td className={`${totalTd} ${stripeBg}`}>
                    {formatRelativeOrDQ(detail.to_par, detail.is_dq)}
                  </td>
                  <td className={`${totalTd} ${stripeBg}`}>
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
