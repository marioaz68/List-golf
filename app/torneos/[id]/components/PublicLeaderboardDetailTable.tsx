"use client";

import { useSearchParams } from "next/navigation";
import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import {
  scoreRoundDetail,
  type StrokeIndexByHole,
} from "@/lib/leaderboard/competitionScoring";
import { scoringFormatLabel } from "@/lib/leaderboard/competitionDisplay";
import {
  parseLeaderboardViewOverride,
  usesGrossHoleByHoleDetail,
  type LeaderboardViewOverride,
} from "@/lib/leaderboard/leaderboardViewOverride";
import { formatPlayingHandicapSummary } from "@/lib/leaderboard/perHoleCompetition";
import PublicLeaderboardHoleAuditRows, {
  showHoleAuditForRule,
} from "./PublicLeaderboardHoleAuditRows";
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

function holesWithStrokesCount(detail: RoundDetail) {
  return detail.holes.filter((h) => h.strokes != null).length;
}

function bestDetailForRoundNo(
  details: RoundDetail[],
  roundNo: number
): RoundDetail | null {
  const candidates = details.filter((d) => d.round_no === roundNo);
  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const strokeDiff =
      holesWithStrokesCount(b) - holesWithStrokesCount(a);
    if (strokeDiff !== 0) return strokeDiff;
    return String(a.round_id).localeCompare(String(b.round_id));
  })[0]!;
}

function getCumulativeRoundDetails(
  allWithScores: RoundDetail[],
  maxRoundNo: number
): RoundDetail[] {
  const cumulative: RoundDetail[] = [];
  for (let roundNo = 1; roundNo <= maxRoundNo; roundNo += 1) {
    const detail = bestDetailForRoundNo(allWithScores, roundNo);
    if (detail && hasHoleOrGross(detail)) {
      cumulative.push(detail);
    }
  }
  return cumulative;
}

/** En vista neto: gross por hoyo R1…R activa bajo Par; después auditoría neto de la ronda activa. */
function getPriorGrossRoundRowsForNetView(
  allWithScores: RoundDetail[],
  maxRoundNo: number
): RoundDetail[] {
  if (maxRoundNo < 1) return [];
  const rows: RoundDetail[] = [];
  for (let roundNo = 1; roundNo <= maxRoundNo; roundNo += 1) {
    const detail = bestDetailForRoundNo(allWithScores, roundNo);
    if (detail && hasHoleOrGross(detail)) {
      rows.push(detail);
    }
  }
  return rows;
}

function resolveAuditDetailForNetView(
  row: LeaderboardRow,
  selectedRound: SelectedRoundMeta | null,
  allWithScores: RoundDetail[]
): RoundDetail | null {
  if (selectedRound?.id) {
    const selectedDetail = resolveDetailForSelectedRound(
      row.details,
      selectedRound,
      row.category_id,
      collectRoundIdsWithScoreCapture(row.details)
    );
    if (selectedDetail) return selectedDetail;
  }
  const maxRoundNo = selectedRound?.round_no ?? 0;
  if (maxRoundNo >= 1) {
    return bestDetailForRoundNo(allWithScores, maxRoundNo);
  }
  return (
    allWithScores.find((d) => d.holes.some((h) => h.strokes != null)) ?? null
  );
}

function getDisplayDetails({
  row,
  selectedRound,
  usesGrossDetail,
  allWithScores,
}: {
  row: LeaderboardRow;
  selectedRound: SelectedRoundMeta | null;
  usesGrossDetail: boolean;
  allWithScores: RoundDetail[];
}) {
  const maxRoundNo = selectedRound?.round_no ?? null;

  if (usesGrossDetail && maxRoundNo != null && maxRoundNo >= 1) {
    const cumulative = getCumulativeRoundDetails(allWithScores, maxRoundNo);
    if (cumulative.length > 0) return cumulative;
  }

  if (!usesGrossDetail) {
    return [];
  }

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

  return allWithScores;
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

function SummaryHeads({
  labels,
  showPositionCol,
  netOnly,
}: {
  labels: PublicDetailTableLabels;
  showPositionCol: boolean;
  netOnly?: boolean;
}) {
  if (netOnly) {
    return (
      <th className="w-[28px] min-w-[26px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[30px] sm:text-[8px]">
        {labels.gross}
      </th>
    );
  }
  return (
    <>
      <th className="w-[24px] min-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[26px] sm:text-[8px]">
        {labels.gross}
      </th>
      <th className="w-[24px] min-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[26px] sm:text-[8px]">
        {labels.toPar}
      </th>
      {showPositionCol ? (
        <th className="w-[20px] min-w-[18px] border-b border-white/10 px-0 py-0.5 text-center text-[7px] font-semibold leading-tight text-cyan-100/90 sm:w-[22px] sm:text-[8px]">
          {labels.pos}
        </th>
      ) : null}
    </>
  );
}

function SummaryCells({
  totals,
  showPositionCol,
  netOnly,
  standingPos,
  isDq,
  stripeBg,
}: {
  totals: { primary: string; secondary: string };
  showPositionCol: boolean;
  netOnly?: boolean;
  standingPos: number | null;
  isDq: boolean;
  stripeBg: string;
}) {
  if (netOnly) {
    return (
      <td className={`${totalTd} ${stripeBg}`}>{totals.primary}</td>
    );
  }
  return (
    <>
      <td className={`${totalTd} ${stripeBg}`}>{totals.primary}</td>
      <td className={`${totalTd} ${stripeBg}`}>{totals.secondary}</td>
      {showPositionCol ? (
        <td className={`${totalTd} ${stripeBg}`}>
          {isDq ? "DQ" : standingPos ?? "—"}
        </td>
      ) : null}
    </>
  );
}

function SummaryPlaceholders({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <td key={`par-sum-${i}`} className={`${totalTd} bg-emerald-950/90`}>
          —
        </td>
      ))}
    </>
  );
}

function detailTotalsForRule(
  detail: RoundDetail,
  rule: CategoryCompetitionRule,
  handicapIndex: number | null | undefined,
  strokeIndexByHole: StrokeIndexByHole | undefined,
  usesGrossDetail: boolean
) {
  const scored = scoreRoundDetail(
    detail,
    rule,
    handicapIndex,
    strokeIndexByHole
  );
  if (detail.is_dq) {
    return { primary: "DQ" as const, secondary: "DQ" as const };
  }
  if (isStablefordCategory(rule)) {
    return {
      primary:
        scored.stablefordPoints != null
          ? formatScore(scored.stablefordPoints)
          : "—",
      secondary:
        scored.gross != null ? formatScore(scored.gross) : "—",
    };
  }
  if (!usesGrossDetail) {
    return {
      primary:
        scored.netToPar != null
          ? formatRelativeOrDQ(scored.netToPar, false)
          : "—",
      secondary:
        scored.gross != null ? formatScore(scored.gross) : "—",
    };
  }
  return {
    primary:
      scored.gross != null ? formatScore(scored.gross) : "—",
    secondary:
      scored.toPar != null
        ? formatRelativeOrDQ(scored.toPar, false)
        : "—",
  };
}

export default function PublicLeaderboardDetailTable({
  row,
  selectedRound,
  labels,
  competitionRule,
  handicapIndex = null,
  strokeIndexByHole,
  leaderboardViewOverride = null,
}: {
  row: LeaderboardRow;
  selectedRound: SelectedRoundMeta | null;
  labels: PublicDetailTableLabels;
  competitionRule?: CategoryCompetitionRule | null;
  handicapIndex?: number | null;
  strokeIndexByHole?: StrokeIndexByHole;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
}) {
  const searchParams = useSearchParams();
  const basisFromUrl = parseLeaderboardViewOverride(
    searchParams.get("basis") ?? undefined
  );
  const viewOverride = leaderboardViewOverride ?? basisFromUrl;

  const rule =
    competitionRule ??
    ({
      scoring_format: row.scoring_format ?? "stroke_play",
      leaderboard_basis: row.leaderboard_basis ?? "gross",
      handicap_percentage: 100,
    } as CategoryCompetitionRule);
  const usesGrossDetail = usesGrossHoleByHoleDetail(rule, viewOverride);
  const isNetDetailLayout =
    !usesGrossDetail && !isStablefordCategory(rule);
  const showPositionCol =
    !isNetDetailLayout && (!usesGrossDetail || isStablefordCategory(rule));
  const summaryColCount = isNetDetailLayout
    ? 1
    : showPositionCol
      ? 3
      : 2;
  const allWithScores = selectLeaderboardDetailsForPlayer(row).filter(
    hasHoleOrGross
  );
  const maxRoundNo = selectedRound?.round_no ?? 0;

  const displayDetails = getDisplayDetails({
    row,
    selectedRound,
    usesGrossDetail,
    allWithScores,
  });

  const grossRowsBelowPar =
    !usesGrossDetail && maxRoundNo >= 1
      ? getPriorGrossRoundRowsForNetView(allWithScores, maxRoundNo)
      : [];

  const handicapSummary = usesGrossDetail
    ? null
    : formatPlayingHandicapSummary(handicapIndex, rule.handicap_percentage);

  const baseRound =
    displayDetails.find((detail) =>
      detail.holes.some((hole) => hole.par != null)
    ) ??
    grossRowsBelowPar.find((detail) =>
      detail.holes.some((hole) => hole.par != null)
    ) ??
    row.details.find((detail) => detail.holes.some((hole) => hole.par != null)) ??
    row.details[0] ??
    null;

  const baseHoles = baseRound?.holes ?? [];

  const auditDetail = usesGrossDetail
    ? displayDetails.length === 1
      ? displayDetails[0]
      : displayDetails.find((d) => d.holes.some((h) => h.strokes != null)) ??
        null
    : resolveAuditDetailForNetView(row, selectedRound, allWithScores);

  /** Neto: 18 hoyos + subtotales + TOT + columna NET; filas R1…Rn con score bruto. */
  const inline = isNetDetailLayout
    ? false
    : labels.detailTotalsPlacement === "inline-after-nines";
  const showEighteenTotalCol = isNetDetailLayout
    ? true
    : !inline && Boolean(labels.totalTitle?.trim());
  const emptyColSpan = inline
    ? 21 + summaryColCount
    : 21 + (showEighteenTotalCol ? 1 : 0) + summaryColCount;
  const tableMinW = inline
    ? summaryColCount === 2
      ? "min-w-[500px]"
      : "min-w-[540px]"
    : "min-w-[580px]";

  const stickyHead =
    `${stickyLabelBase} z-20 w-[40px] min-w-[40px] max-w-[44px] bg-cyan-950 px-1 py-0.5 text-left text-[8px] font-semibold leading-tight sm:w-[44px] sm:min-w-[44px] sm:text-[9px]`;

  const stickyPar =
    `${stickyLabelBase} z-20 w-[40px] min-w-[40px] max-w-[44px] bg-emerald-950 px-1 py-0.5 text-left text-[8px] font-semibold leading-tight sm:w-[44px] sm:min-w-[44px] sm:text-[9px]`;

  const stickyRound = (stripeBg: string) =>
    `${stickyLabelBase} w-[40px] min-w-[40px] max-w-[44px] px-1 py-0.5 text-left text-[8px] font-semibold leading-tight text-cyan-100 sm:w-[44px] sm:min-w-[44px] sm:text-[9px] ${stripeBg}`;

  return (
    <div className="mt-1.5 inline-block w-max min-w-0 max-w-full rounded-xl border border-white/10 bg-[#08111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      {!usesGrossDetail ? (
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
            {` · ${scoringFormatLabel(rule, viewOverride)}`}
            {handicapSummary ? ` · ${handicapSummary}` : ""}
            {row.is_disqualified ? ` · DQ` : ""}
          </div>
        </div>
      ) : null}

      <table
        className={`w-max min-w-full ${tableMinW} border-separate border-spacing-0 text-[9px] text-white sm:text-[10px]`}
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
                <SummaryHeads
                  labels={labels}
                  showPositionCol={showPositionCol}
                  netOnly={isNetDetailLayout}
                />
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
                <SummaryHeads
                  labels={labels}
                  showPositionCol={showPositionCol}
                  netOnly={isNetDetailLayout}
                />
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
                <SummaryPlaceholders count={summaryColCount} />
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
                <SummaryPlaceholders count={summaryColCount} />
              </>
            )}
          </tr>

          {grossRowsBelowPar.map((detail, detailIndex) => {
            const standing =
              row.standing_by_round_category.find(
                (s) => s.round_id === detail.round_id
              ) ??
              row.standing_by_round.find((s) => s.round_id === detail.round_id) ??
              null;
            const stripeBg =
              detailIndex % 2 === 0 ? "bg-[#0c1928]" : "bg-[#0b1728]";
            const grossTotals = detailTotalsForRule(
              detail,
              rule,
              handicapIndex,
              strokeIndexByHole,
              true
            );
            const netTotals = detailTotalsForRule(
              detail,
              rule,
              handicapIndex,
              strokeIndexByHole,
              false
            );
            const roundSummaryTotals = isNetDetailLayout
              ? netTotals
              : grossTotals;

            return (
              <tr
                key={`gross-below-par-${row.entry_id}-${detail.round_id}`}
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
                          key={`gross-bp-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
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
                          key={`gross-bp-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
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
                          key={`gross-bp-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
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
                        {detail.is_dq
                          ? "DQ"
                          : formatScore(detail.total_score)}
                      </td>
                    ) : null}
                  </>
                )}
                <SummaryCells
                  totals={roundSummaryTotals}
                  showPositionCol={showPositionCol}
                  netOnly={isNetDetailLayout}
                  standingPos={standing?.pos ?? null}
                  isDq={detail.is_dq}
                  stripeBg={stripeBg}
                />
              </tr>
            );
          })}

          {auditDetail &&
          !isNetDetailLayout &&
          showHoleAuditForRule(rule, viewOverride) ? (
            <PublicLeaderboardHoleAuditRows
              detail={auditDetail}
              rule={rule}
              handicapIndex={handicapIndex}
              strokeIndexByHole={strokeIndexByHole}
              baseHoles={baseHoles}
              inline={inline}
              showEighteenTotalCol={showEighteenTotalCol}
              summaryColCount={summaryColCount}
              viewOverride={viewOverride}
              entryId={row.entry_id}
              labels={{
                strokeIndex: labels.auditStrokeIndex,
                strokesReceived: labels.auditStrokesReceived,
                netStrokes: labels.auditNetStrokes,
                stablefordPoints: labels.auditStablefordPoints,
              }}
            />
          ) : null}

          {displayDetails.length === 0 &&
          grossRowsBelowPar.length === 0 &&
          !auditDetail ? (
            <tr>
              <td
                colSpan={emptyColSpan}
                className="border-b border-white/10 px-2 py-3 text-center text-[9px] text-slate-400 sm:text-[10px]"
              >
                {labels.noCapture}
              </td>
            </tr>
          ) : displayDetails.length === 0 ? null : (
            displayDetails.map((detail, detailIndex) => {
              const standing =
                row.standing_by_round_category.find(
                  (s) => s.round_id === detail.round_id
                ) ??
                row.standing_by_round.find((s) => s.round_id === detail.round_id) ??
                null;

              const stripeBg =
                detailIndex % 2 === 0 ? "bg-[#0c1928]" : "bg-[#0b1728]";
              const totals = detailTotalsForRule(
                detail,
                rule,
                handicapIndex,
                strokeIndexByHole,
                usesGrossDetail
              );

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

                  <SummaryCells
                    totals={totals}
                    showPositionCol={showPositionCol}
                    netOnly={isNetDetailLayout}
                    standingPos={standing?.pos ?? null}
                    isDq={detail.is_dq}
                    stripeBg={stripeBg}
                  />
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
