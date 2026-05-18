import type { RoundDetail } from "@/app/torneos/[id]/lib/types";
import { formatRelativeOrDQ } from "@/app/torneos/[id]/lib/utils";
import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { formatRoundCellForRule } from "./competitionDisplay";
import type { StrokeIndexByHole } from "./competitionScoring";
import {
  isEntryRoundClosed,
  type LockedScorecardLookups,
  type RoundIdMeta,
} from "./lockedScorecards";
import type { LeaderboardViewOverride } from "./leaderboardViewOverride";
import {
  resolveDetailForRoundNo,
  roundRowAppliesToEntry,
} from "./roundCategoryMatch";

export function roundIdForEntryRoundNo(
  rounds: RoundIdMeta[],
  entryCategoryId: string | null | undefined,
  roundNo: number
): string | null {
  const matches = rounds.filter(
    (r) =>
      r.round_no === roundNo &&
      roundRowAppliesToEntry({ category_id: r.category_id ?? null }, entryCategoryId)
  );
  if (matches.length === 0) {
    const fallback = rounds.find((r) => r.round_no === roundNo);
    return fallback?.id ?? null;
  }
  if (matches.length === 1) return matches[0]!.id;
  const ec = String(entryCategoryId ?? "").trim();
  if (ec) {
    const byCat = matches.find((r) => String(r.category_id ?? "").trim() === ec);
    if (byCat) return byCat.id;
  }
  return [...matches].sort((a, b) => String(a.id).localeCompare(String(b.id)))[0]!
    .id;
}

export function isPublicRoundScorecardClosed(
  entryId: string,
  roundNo: number,
  entryCategoryId: string | null | undefined,
  rounds: RoundIdMeta[],
  lockedLookups: LockedScorecardLookups
): boolean {
  const roundId = roundIdForEntryRoundNo(rounds, entryCategoryId, roundNo);
  if (!roundId) return false;
  return isEntryRoundClosed(entryId, { id: roundId, round_no: roundNo }, lockedLookups);
}

/** Solo rondas con tarjeta cerrada cuentan para totales y posiciones acumuladas. */
export function detailsForPublicCumulative(
  details: RoundDetail[],
  entryId: string,
  entryCategoryId: string | null | undefined,
  rounds: RoundIdMeta[],
  lockedLookups: LockedScorecardLookups
): RoundDetail[] {
  return details.map((detail) => {
    if (
      !isPublicRoundScorecardClosed(
        entryId,
        detail.round_no,
        entryCategoryId,
        rounds,
        lockedLookups
      )
    ) {
      return {
        ...detail,
        gross_score: null,
        to_par: null,
        out_score: null,
        in_score: null,
        total_score: null,
        holes: detail.holes.map((h) => ({
          ...h,
          strokes: null,
        })),
      };
    }
    return detail;
  });
}

export function formatPublicRoundColumnCell(params: {
  details: RoundDetail[];
  roundNo: number;
  entryId: string;
  entryCategoryId: string | null | undefined;
  scoreRoundIds: ReadonlySet<string>;
  rounds: RoundIdMeta[];
  lockedLookups: LockedScorecardLookups;
  view: "live" | "official";
  selectedRoundNo: number;
  rule: CategoryCompetitionRule;
  handicapIndex: number | null | undefined;
  isDisqualified: boolean;
  strokeIndexByHole?: StrokeIndexByHole;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
}): string {
  const {
    details,
    roundNo,
    entryId,
    entryCategoryId,
    scoreRoundIds,
    rounds,
    lockedLookups,
    view,
    selectedRoundNo,
    rule,
    handicapIndex,
    isDisqualified,
    strokeIndexByHole,
    leaderboardViewOverride,
  } = params;

  if (isDisqualified) return "DQ";

  const scoreRoundIdsForNo = new Set(
    [...scoreRoundIds].filter((rid) => {
      const d = details.find((x) => x.round_id === rid);
      return d?.round_no === roundNo;
    })
  );

  const detail = resolveDetailForRoundNo(
    details,
    roundNo,
    entryCategoryId,
    scoreRoundIdsForNo
  );

  const closed = isPublicRoundScorecardClosed(
    entryId,
    roundNo,
    entryCategoryId,
    rounds,
    lockedLookups
  );

  const isLiveCurrentRound =
    view === "live" && roundNo === selectedRoundNo && !closed;

  if (isLiveCurrentRound) {
    return formatRoundCellForRule(
      detail,
      rule,
      handicapIndex,
      false,
      strokeIndexByHole,
      leaderboardViewOverride
    );
  }

  if (!closed) {
    return formatRelativeOrDQ(0, false);
  }

  return formatRoundCellForRule(
    detail,
    rule,
    handicapIndex,
    false,
    strokeIndexByHole,
    leaderboardViewOverride
  );
}
