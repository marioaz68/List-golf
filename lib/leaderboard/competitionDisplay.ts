import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { scoreRoundDetail } from "./competitionScoring";
import type { LeaderboardRow, RoundDetail } from "@/app/torneos/[id]/lib/types";
import { formatRelativeOrDQ, formatScoreOrDQ } from "@/app/torneos/[id]/lib/utils";

export function scoringFormatLabel(
  rule: CategoryCompetitionRule
): string {
  if (rule.scoring_format === "stableford") return "Stableford";
  if (rule.leaderboard_basis === "net" || rule.leaderboard_basis === "both") {
    return "Stroke · Neto";
  }
  return "Stroke · Gross";
}

export function mainTotalColumnHeader(rule: CategoryCompetitionRule): string {
  if (rule.scoring_format === "stableford" || rule.leaderboard_basis === "stableford") {
    return "PTS";
  }
  if (rule.leaderboard_basis === "net" || rule.leaderboard_basis === "both") {
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
  isDisqualified: boolean
): string {
  if (isDisqualified) return "DQ";
  if (!detail) return "—";
  const scored = scoreRoundDetail(detail, rule, handicapIndex);

  if (rule.scoring_format === "stableford") {
    return scored.stablefordPoints != null
      ? formatScoreOrDQ(scored.stablefordPoints, false)
      : "—";
  }

  if (rule.leaderboard_basis === "net" || rule.leaderboard_basis === "both") {
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
  rule: CategoryCompetitionRule
): string {
  if (row.is_disqualified) return "DQ";
  if (rule.scoring_format === "stableford") {
    return formatScoreOrDQ(row.total_to_par, false);
  }
  if (rule.leaderboard_basis === "net" || rule.leaderboard_basis === "both") {
    return formatRelativeOrDQ(row.total_to_par, false);
  }
  return formatRelativeOrDQ(row.total_to_par, row.is_disqualified);
}

export function detailScoreColumnLabels(rule: CategoryCompetitionRule): {
  primary: string;
  secondary: string;
  modality: string;
} {
  if (rule.scoring_format === "stableford") {
    return {
      primary: "PTS",
      secondary: "GR",
      modality: "Stableford",
    };
  }
  if (rule.leaderboard_basis === "net" || rule.leaderboard_basis === "both") {
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
