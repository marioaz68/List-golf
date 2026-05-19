import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import {
  effectiveUsesNetLeaderboard,
  type LeaderboardViewOverride,
} from "@/lib/leaderboard/leaderboardViewOverride";
import type { StrokeIndexByHole } from "@/lib/leaderboard/competitionScoring";
import {
  perHoleCompetitionBreakdown,
  type PerHoleCompetitionCell,
} from "@/lib/leaderboard/perHoleCompetition";
import type { RoundDetail } from "../lib/types";
import { formatScore } from "../lib/utils";

const stickyAudit =
  "sticky left-0 z-10 border-b border-r border-white/10 bg-violet-950 px-1 py-0.5 text-left text-[8px] font-semibold leading-tight text-violet-100 shadow-[6px_0_12px_-4px_rgba(0,0,0,0.45)] sm:text-[9px]";

const auditTd =
  "w-[22px] min-w-[22px] max-w-[22px] border-b border-white/10 px-0 py-0.5 text-center text-[8px] font-semibold leading-none text-violet-100/95 sm:w-6 sm:min-w-[24px] sm:max-w-[24px] sm:text-[9px]";

const auditTotalTd =
  "border-b border-white/10 px-0.5 py-0.5 text-center text-[8px] font-semibold leading-none text-violet-100 sm:text-[9px]";

function cellAt(cells: PerHoleCompetitionCell[], holeNumber: number) {
  return cells.find((c) => c.holeNumber === holeNumber) ?? null;
}

function formatAuditValue(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return formatScore(value);
}

type AuditLabels = {
  strokeIndex: string;
  strokesReceived: string;
  netStrokes: string;
  stablefordPoints: string;
};

type Props = {
  detail: RoundDetail;
  rule: CategoryCompetitionRule;
  handicapIndex: number | null | undefined;
  strokeIndexByHole?: StrokeIndexByHole;
  baseHoles: RoundDetail["holes"];
  inline: boolean;
  showEighteenTotalCol: boolean;
  summaryColCount: number;
  viewOverride?: LeaderboardViewOverride | null;
  entryId: string;
  labels: AuditLabels;
};

export function showHoleAuditForRule(
  rule: CategoryCompetitionRule,
  viewOverride?: LeaderboardViewOverride | null
): boolean {
  if (viewOverride === "gross") return false;
  return (
    isStablefordCategory(rule) ||
    effectiveUsesNetLeaderboard(rule, viewOverride)
  );
}

function AuditRow({
  label,
  entryId,
  inline,
  showEighteenTotalCol,
  summaryColCount,
  baseHoles,
  cells,
  pick,
  sumPick,
}: {
  label: string;
  entryId: string;
  inline: boolean;
  showEighteenTotalCol: boolean;
  summaryColCount: number;
  baseHoles: RoundDetail["holes"];
  cells: PerHoleCompetitionCell[];
  pick: (c: PerHoleCompetitionCell | null) => number | null;
  sumPick: (slice: PerHoleCompetitionCell[]) => number | null;
}) {
  const summaryPlaceholders = Array.from({ length: summaryColCount }, (_, i) => (
    <td key={`${label}-${entryId}-sum-${i}`} className={auditTotalTd}>
      —
    </td>
  ));
  const slice18 = Array.from({ length: 18 }, (_, i) =>
    cellAt(cells, i + 1)
  ).filter(Boolean) as PerHoleCompetitionCell[];

  return (
    <tr className="bg-violet-950/40 text-violet-100">
      <td className={stickyAudit}>{label}</td>
      {inline ? (
        <>
          {Array.from({ length: 9 }, (_, i) => {
            const c = cellAt(cells, i + 1);
            return (
              <td key={`${label}-${entryId}-h${i + 1}`} className={auditTd}>
                {formatAuditValue(pick(c))}
              </td>
            );
          })}
          <td className={auditTotalTd}>
            {formatAuditValue(
              sumPick(
                slice18.filter((c) => c.holeNumber >= 1 && c.holeNumber <= 9)
              )
            )}
          </td>
          {Array.from({ length: 9 }, (_, i) => {
            const c = cellAt(cells, i + 10);
            return (
              <td key={`${label}-${entryId}-h${i + 10}`} className={auditTd}>
                {formatAuditValue(pick(c))}
              </td>
            );
          })}
          <td className={auditTotalTd}>
            {formatAuditValue(
              sumPick(
                slice18.filter((c) => c.holeNumber >= 10 && c.holeNumber <= 18)
              )
            )}
          </td>
          {summaryPlaceholders}
        </>
      ) : (
        <>
          {Array.from({ length: 18 }, (_, i) => {
            const c = cellAt(cells, i + 1);
            return (
              <td key={`${label}-${entryId}-h${i + 1}`} className={auditTd}>
                {formatAuditValue(pick(c))}
              </td>
            );
          })}
          <td className={auditTotalTd}>
            {formatAuditValue(
              sumPick(
                slice18.filter((c) => c.holeNumber >= 1 && c.holeNumber <= 9)
              )
            )}
          </td>
          <td className={auditTotalTd}>
            {formatAuditValue(
              sumPick(
                slice18.filter((c) => c.holeNumber >= 10 && c.holeNumber <= 18)
              )
            )}
          </td>
          {showEighteenTotalCol ? (
            <td className={auditTotalTd}>
              {formatAuditValue(sumPick(slice18))}
            </td>
          ) : null}
          {summaryPlaceholders}
        </>
      )}
    </tr>
  );
}

export default function PublicLeaderboardHoleAuditRows({
  detail,
  rule,
  handicapIndex,
  strokeIndexByHole,
  baseHoles,
  inline,
  showEighteenTotalCol,
  summaryColCount,
  viewOverride = null,
  entryId,
  labels,
}: Props) {
  const cells = perHoleCompetitionBreakdown(
    detail,
    rule,
    handicapIndex,
    strokeIndexByHole
  );
  const useNet = effectiveUsesNetLeaderboard(rule, viewOverride);
  const useSf = isStablefordCategory(rule);

  const sum = (slice: PerHoleCompetitionCell[], fn: (c: PerHoleCompetitionCell) => number) => {
    if (slice.length === 0) return null;
    let total = 0;
    let any = false;
    for (const c of slice) {
      const v = fn(c);
      if (v != null && !Number.isNaN(v)) {
        total += v;
        any = true;
      }
    }
    return any ? total : null;
  };

  return (
    <>
      <AuditRow
        label={labels.strokeIndex}
        entryId={entryId}
        inline={inline}
        showEighteenTotalCol={showEighteenTotalCol}
        summaryColCount={summaryColCount}
        baseHoles={baseHoles}
        cells={cells}
        pick={(c) => c?.strokeIndex ?? null}
        sumPick={() => null}
      />
      {useNet ? (
        <AuditRow
          label={labels.strokesReceived}
          entryId={entryId}
          inline={inline}
          showEighteenTotalCol={showEighteenTotalCol}
          summaryColCount={summaryColCount}
          baseHoles={baseHoles}
          cells={cells}
          pick={(c) => c?.strokesReceived ?? null}
          sumPick={(slice) => sum(slice, (c) => c.strokesReceived)}
        />
      ) : null}
      {useNet ? (
        <AuditRow
          label={labels.netStrokes}
          entryId={entryId}
          inline={inline}
          showEighteenTotalCol={showEighteenTotalCol}
          summaryColCount={summaryColCount}
          baseHoles={baseHoles}
          cells={cells}
          pick={(c) => c?.netStrokes ?? null}
          sumPick={(slice) => sum(slice, (c) => c.netStrokes ?? 0)}
        />
      ) : null}
      {useSf ? (
        <AuditRow
          label={labels.stablefordPoints}
          entryId={entryId}
          inline={inline}
          showEighteenTotalCol={showEighteenTotalCol}
          summaryColCount={summaryColCount}
          baseHoles={baseHoles}
          cells={cells}
          pick={(c) => c?.stablefordPoints ?? null}
          sumPick={(slice) => sum(slice, (c) => c.stablefordPoints ?? 0)}
        />
      ) : null}
    </>
  );
}
