import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "./categoryCompetitionRules";
import { scoreRoundDetail, type StrokeIndexByHole } from "./competitionScoring";
import {
  effectiveUsesNetLeaderboard,
  type LeaderboardViewOverride,
} from "./leaderboardViewOverride";
import type { LeaderboardRow, RoundDetail } from "@/app/torneos/[id]/lib/types";
import { formatRelativeOrDQ, formatScoreOrDQ } from "@/app/torneos/[id]/lib/utils";

export function scoringFormatLabel(
  rule: CategoryCompetitionRule
): string {
  if (isStablefordCategory(rule)) return "Stableford";
  if (effectiveUsesNetLeaderboard(rule, null)) {
    return "Stroke · Neto";
  }
  return "Stroke · Gross";
}

export function mainTotalColumnHeader(
  rule: CategoryCompetitionRule,
  viewOverride?: LeaderboardViewOverride | null
): string {
  if (isStablefordCategory(rule)) {
    return "PTS";
  }
  if (effectiveUsesNetLeaderboard(rule, viewOverride)) {
    return "NET";
  }
  return "TOT";
}

export function secondaryTotalColumnHeader(
  rule: CategoryCompetitionRule
): string {
  if (rule.scoring_format === "stableford") return "GR";
  if (
    rule.leaderboard_basis === "net" ||
    rule.leaderboard_basis === "both"
  ) {
    return "GR";
  }
  return "GR";
}

export function formatSecondaryTotalForRow(
  row: LeaderboardRow,
  rule: CategoryCompetitionRule
): string {
  if (row.is_disqualified) return "DQ";
  return formatScoreOrDQ(row.total_gross, false);
}

export function formatRoundCellForRule(
  detail: RoundDetail | null,
  rule: CategoryCompetitionRule,
  handicapIndex: number | null | undefined,
  isDisqualified: boolean,
  strokeIndexByHole?: StrokeIndexByHole,
  viewOverride?: LeaderboardViewOverride | null
): string {
  if (isDisqualified) return "DQ";
  if (!detail) return "—";
  const scored = scoreRoundDetail(
    detail,
    rule,
    handicapIndex,
    strokeIndexByHole
  );

  if (isStablefordCategory(rule)) {
    return scored.stablefordPoints != null
      ? formatScoreOrDQ(scored.stablefordPoints, false)
      : "—";
  }

  if (effectiveUsesNetLeaderboard(rule, viewOverride)) {
    if (scored.netToPar != null) {
      return formatRelativeOrDQ(scored.netToPar, false);
    }
  }

  if (scored.toPar != null) {
    return formatRelativeOrDQ(scored.toPar, false);
  }
  if (scored.gross != null) {
    return formatScoreOrDQ(scored.gross, false);
  }
  return "—";
}

export function formatMainTotalForRow(
  row: LeaderboardRow,
  rule: CategoryCompetitionRule,
  viewOverride?: LeaderboardViewOverride | null
): string {
  if (row.is_disqualified) return "DQ";
  if (isStablefordCategory(rule)) {
    return formatScoreOrDQ(row.total_to_par, false);
  }
  if (effectiveUsesNetLeaderboard(rule, viewOverride)) {
    return formatRelativeOrDQ(row.total_to_par, false);
  }
  return formatRelativeOrDQ(row.total_to_par, row.is_disqualified);
}

export function detailScoreColumnLabels(
  rule: CategoryCompetitionRule,
  viewOverride?: LeaderboardViewOverride | null
): {
  primary: string;
  secondary: string;
  modality: string;
} {
  if (isStablefordCategory(rule)) {
    return {
      primary: "PTS",
      secondary: "GR",
      modality: "Stableford",
    };
  }
  if (effectiveUsesNetLeaderboard(rule, viewOverride)) {
    return {
      primary: "NET",
      secondary: "GR",
      modality: "Stroke · Neto",
    };
  }
  return {
    primary: "GR",
    secondary: "TO PAR",
    modality: "Stroke · Gross",
  };
}
