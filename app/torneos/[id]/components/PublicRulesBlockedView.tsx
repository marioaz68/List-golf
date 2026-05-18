import type { RulesBlocker } from "@/lib/tournament-rules/collectRulesBlockers";

export type PublicRulesBlockedLabels = {
  title: string;
  intro: string;
  competitionLoadFailed: string;
  cutLoadFailed: string;
  categoriesMissingRule: string;
  competitionInvalidConfig: string;
  strokeIndexIncomplete: string;
  adminLinksHint: string;
};

function messageForBlocker(
  item: RulesBlocker,
  labels: PublicRulesBlockedLabels
): string {
  const p = item.params ?? {};
  switch (item.code) {
    case "competition_rules_load_failed":
      return labels.competitionLoadFailed;
    case "cut_rules_load_failed":
      return labels.cutLoadFailed;
    case "categories_missing_competition_rule":
      return labels.categoriesMissingRule.replace(
        "{codes}",
        String(p.codes ?? "")
      );
    case "competition_rule_invalid_config":
      return labels.competitionInvalidConfig.replace(
        "{details}",
        String(p.details ?? "")
      );
    case "course_stroke_index_incomplete":
      return labels.strokeIndexIncomplete.replace(
        "{count}",
        String(p.count ?? 0)
      );
    default:
      return labels.intro;
  }
}

export default function PublicRulesBlockedView({
  blockers,
  labels,
}: {
  blockers: RulesBlocker[];
  labels: PublicRulesBlockedLabels;
}) {
  return (
    <div
      className="rounded-2xl border border-rose-400/45 bg-rose-950/50 px-4 py-5 text-rose-50 shadow-lg sm:px-6"
      role="alert"
    >
      <h2 className="text-lg font-bold tracking-tight">{labels.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-rose-100/90">
        {labels.intro}
      </p>
      <ul className="mt-4 list-inside list-disc space-y-2 text-sm">
        {blockers.map((item, i) => (
          <li key={`${item.code}-${i}`}>{messageForBlocker(item, labels)}</li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-rose-200/80">{labels.adminLinksHint}</p>
    </div>
  );
}

