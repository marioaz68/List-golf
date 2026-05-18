import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import type { PublicPrizeRuleRow } from "@/lib/leaderboard/filterPublicPrizeRules";

type Props = {
  categoryCode: string | null;
  competitionRule: CategoryCompetitionRule;
  prizeRules: PublicPrizeRuleRow[];
  labels: {
    title: string;
    configuredPlaces: string;
    grossPlace: string;
    netPlace: string;
    stablefordPlace: string;
    noDetailedRules: string;
    basisGross: string;
    basisNet: string;
    basisStableford: string;
  };
};

function basisLabel(
  basis: PublicPrizeRuleRow["ranking_basis"],
  labels: Props["labels"]
) {
  if (basis === "net") return labels.basisNet;
  if (basis === "stableford") return labels.basisStableford;
  return labels.basisGross;
}

function configuredPlacesSummary(
  rule: CategoryCompetitionRule,
  labels: Props["labels"]
): string[] {
  const lines: string[] = [];
  const gross = Math.max(1, Number(rule.gross_prize_places ?? 1));
  const net = rule.net_prize_places;

  if (
    rule.prize_basis === "gross" ||
    rule.prize_basis === "both" ||
    !rule.prize_basis
  ) {
    lines.push(labels.grossPlace.replace("{n}", String(gross)));
  }
  if (rule.prize_basis === "net" || rule.prize_basis === "both") {
    const n = net != null && net > 0 ? net : 1;
    lines.push(labels.netPlace.replace("{n}", String(n)));
  }
  if (rule.prize_basis === "stableford" || rule.scoring_format === "stableford") {
    lines.push(labels.stablefordPlace.replace("{n}", String(gross)));
  }
  return lines;
}

export default function PublicPrizesPanel({
  categoryCode,
  competitionRule,
  prizeRules,
  labels,
}: Props) {
  const places = configuredPlacesSummary(competitionRule, labels);

  return (
    <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-950/20 px-3 py-2.5 text-sm text-amber-50 sm:px-4">
      <p className="font-semibold">
        {labels.title}
        {categoryCode ? ` · ${categoryCode}` : ""}
      </p>
      {places.length > 0 ? (
        <p className="mt-2 text-[13px] text-amber-100/90">
          <span className="text-amber-300/80">{labels.configuredPlaces}:</span>{" "}
          {places.join(" · ")}
        </p>
      ) : null}
      {prizeRules.length > 0 ? (
        <ul className="mt-2 space-y-1 text-[13px] leading-snug text-amber-100/90">
          {prizeRules.map((row) => (
            <li key={row.id}>
              <span className="font-semibold text-amber-200">
                {row.prize_position}.
              </span>{" "}
              {row.prize_label.trim() || `${row.prize_position}`}
              <span className="text-amber-300/70">
                {" "}
                · {basisLabel(row.ranking_basis, labels)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-[12px] text-amber-200/70">{labels.noDetailedRules}</p>
      )}
    </div>
  );
}
