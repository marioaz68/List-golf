import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import {
  rulesByCategoryId,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";
import { competitionRuleForCategory } from "./resolveCompetitionRule";
import {
  cumulativeLeaderboardValue,
  type StrokeIndexByHole,
} from "./competitionScoring";
import type { LockedScorecardLookups, RoundIdMeta } from "./lockedScorecards";
import type { LeaderboardViewOverride } from "./leaderboardViewOverride";
import { detailsForPublicCumulative } from "./publicRoundScorePolicy";
import { sortLeaderboardByCompetitionOrder } from "./sortLeaderboardRows";

export function applyCompetitionRules({
  leaderboard,
  competitionRules,
  handicapByPlayerId,
  maxRoundNo,
  strokeIndexByHole,
  leaderboardViewOverride = null,
  lockedLookups,
  roundsForLock,
  includeIncompleteRounds = false,
}: {
  leaderboard: LeaderboardRow[];
  competitionRules: CategoryCompetitionRule[];
  handicapByPlayerId: Map<string, number | null>;
  maxRoundNo: number | null;
  strokeIndexByHole?: StrokeIndexByHole;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
  lockedLookups?: LockedScorecardLookups;
  roundsForLock?: RoundIdMeta[];
  /** Live: totales y orden con captura parcial (R1 + avance de R2, etc.). */
  includeIncompleteRounds?: boolean;
}): LeaderboardRow[] {
  const rulesMap = rulesByCategoryId(competitionRules);

  const enriched = leaderboard.map((row) => {
    const rule = competitionRuleForCategory(rulesMap, row.category_id);

    const hcp = handicapByPlayerId.get(row.player_id) ?? null;
    const detailsForCum =
      !includeIncompleteRounds && lockedLookups && roundsForLock
        ? detailsForPublicCumulative(
            row.details,
            row.entry_id,
            row.category_id,
            roundsForLock,
            lockedLookups
          )
        : row.details;
    const cum = cumulativeLeaderboardValue(
      detailsForCum,
      rule,
      hcp,
      maxRoundNo,
      strokeIndexByHole,
      leaderboardViewOverride
    );

    return {
      ...row,
      scoring_format: rule.scoring_format,
      leaderboard_basis: rule.leaderboard_basis,
      total_to_par: row.is_disqualified ? null : cum.displayToPar,
      total_gross: row.is_disqualified ? null : cum.displayGross ?? row.total_gross,
      leaderboard_sort_value: row.is_disqualified ? null : cum.sortValue,
      stableford_total: cum.stablefordTotal,
    };
  });

  return sortLeaderboardByCompetitionOrder(enriched, competitionRules);
}
