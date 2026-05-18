import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import { categoryShowsGrossNetToggle } from "@/lib/leaderboard/categoryCompetitionRules";
import { scoringFormatLabel } from "@/lib/leaderboard/competitionDisplay";

type Props = {
  categoryCode: string | null;
  rule: CategoryCompetitionRule;
  labels: {
    title: string;
    modality: string;
    leaderboard: string;
    prizes: string;
    grossPlaces: string;
    netPlaces: string;
    stablefordPlaces: string;
    grossNetToggleHint: string;
  };
};

function prizePlacesLabel(
  rule: CategoryCompetitionRule,
  labels: Props["labels"]
): string {
  const gross = Number(rule.gross_prize_places ?? 0);
  const net = rule.net_prize_places;

  if (rule.prize_basis === "stableford" || rule.scoring_format === "stableford") {
    return labels.stablefordPlaces;
  }
  if (rule.prize_basis === "gross") {
    return labels.grossPlaces.replace("{n}", String(Math.max(1, gross)));
  }
  if (rule.prize_basis === "net") {
    const n = net != null && net > 0 ? net : 1;
    return labels.netPlaces.replace("{n}", String(n));
  }
  if (rule.prize_basis === "both") {
    const netN = net != null && net > 0 ? net : 1;
    return `${labels.grossPlaces.replace("{n}", String(Math.max(1, gross)))} · ${labels.netPlaces.replace("{n}", String(netN))}`;
  }
  return labels.grossPlaces.replace("{n}", String(Math.max(1, gross)));
}

function leaderboardBasisLabel(basis: CategoryCompetitionRule["leaderboard_basis"]) {
  switch (basis) {
    case "net":
      return "Neto";
    case "both":
      return "Neto (principal) + Gross visible";
    case "stableford":
      return "Puntos Stableford";
    default:
      return "Gross";
  }
}

export default function PublicCategoryCompetitionInfo({
  categoryCode,
  rule,
  labels,
}: Props) {
  const showToggleHint = categoryShowsGrossNetToggle(rule);

  return (
    <div className="mb-4 rounded-xl border border-cyan-500/25 bg-cyan-950/20 px-3 py-2.5 text-sm text-cyan-50 sm:px-4">
      <p className="font-semibold">
        {labels.title}
        {categoryCode ? ` · ${categoryCode}` : ""}
      </p>
      <ul className="mt-2 space-y-1 text-[13px] leading-snug text-cyan-100/90">
        <li>
          <span className="text-cyan-300/80">{labels.modality}:</span>{" "}
          {scoringFormatLabel(rule)}
        </li>
        <li>
          <span className="text-cyan-300/80">{labels.leaderboard}:</span>{" "}
          {leaderboardBasisLabel(rule.leaderboard_basis)}
        </li>
        <li>
          <span className="text-cyan-300/80">{labels.prizes}:</span>{" "}
          {prizePlacesLabel(rule, labels)}
        </li>
        {showToggleHint ? (
          <li className="text-amber-100/90">{labels.grossNetToggleHint}</li>
        ) : null}
      </ul>
    </div>
  );
}
