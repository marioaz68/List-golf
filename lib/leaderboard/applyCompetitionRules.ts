// lib/leaderboard/applyCompetitionRules.ts

export function applyCompetitionRules({
  leaderboard,
  competitionRules,
}: any) {
  if (!competitionRules) {
    return leaderboard;
  }

  const basis = competitionRules.leaderboard_basis ?? "gross";

  return [...leaderboard].sort((a: any, b: any) => {
    if (a.is_disqualified && !b.is_disqualified) return 1;
    if (!a.is_disqualified && b.is_disqualified) return -1;

    if (basis === "gross") {
      if (a.total_gross != null && b.total_gross != null) {
        return a.total_gross - b.total_gross;
      }
    }

    if (basis === "net") {
      if (a.total_to_par != null && b.total_to_par != null) {
        return a.total_to_par - b.total_to_par;
      }
    }

    return 0;
  });
}