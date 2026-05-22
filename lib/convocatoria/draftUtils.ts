import { ccqTorneoAnualMachote } from "./templates/ccqTorneoAnualMachote";
import type {
  ConvocatoriaDraft,
  DraftCompetitionRule,
} from "./types";

export type ConvocatoriaWorkflowStatus = "editing" | "closed" | "applied";

export function normalizeWorkflowStatus(
  raw: string | null | undefined
): ConvocatoriaWorkflowStatus {
  if (raw === "closed" || raw === "applied") return raw;
  if (raw === "draft") return "editing";
  return "editing";
}

/** Recalcula reglas de corte cuando cambian meta o categorías con corte. */
export function refreshCutRulesFromMeta(draft: ConvocatoriaDraft): ConvocatoriaDraft {
  const roundCount = draft.meta.round_count ?? 3;
  const cutPct = draft.meta.cut_percent ?? 50;
  const codesWithCut = new Set(
    draft.categories.filter((c) => c.has_cut).map((c) => c.code.toUpperCase())
  );

  const cut_rules = draft.cut_rules
    .map((r) => ({
      ...r,
      to_round_no: roundCount,
      advancement_value:
        r.advancement_type === "top_percent" ? cutPct : r.advancement_value,
      category_codes: r.category_codes.filter((c) => codesWithCut.has(c.toUpperCase())),
    }))
    .filter((r) => r.category_codes.length > 0);

  return { ...draft, cut_rules };
}

export function ensureCompetitionForCategories(
  draft: ConvocatoriaDraft
): ConvocatoriaDraft {
  const byCode = new Map(
    draft.competition_rules.map((r) => [r.category_code.toUpperCase(), r])
  );

  const competition_rules: DraftCompetitionRule[] = draft.categories.map((c) => {
    const existing = byCode.get(c.code.toUpperCase());
    if (existing) return { ...existing, category_code: c.code.toUpperCase() };
    const stableford = /stableford/i.test(c.format_notes ?? "");
    return {
      category_code: c.code.toUpperCase(),
      scoring_format: stableford ? "stableford" : "stroke_play",
      leaderboard_basis: stableford ? "stableford" : "gross",
      prize_basis: stableford ? "stableford" : "gross",
      handicap_percentage: stableford ? 80 : 0,
      gross_prize_places: 3,
      net_prize_places: null,
      notes: c.format_notes,
    };
  });

  return { ...draft, competition_rules };
}

/** Rellena meta/reference nuevos en borradores guardados antes de la alineación 68º. */
export function normalizeConvocatoriaDraft(
  draft: ConvocatoriaDraft | null | undefined
): ConvocatoriaDraft {
  const defaults = ccqTorneoAnualMachote();
  const base =
    draft && typeof draft === "object" ? draft : ({} as ConvocatoriaDraft);
  return {
    ...defaults,
    ...base,
    meta: { ...defaults.meta, ...base.meta },
    reference: base.reference ?? defaults.reference,
    categories: Array.isArray(base.categories)
      ? base.categories
      : defaults.categories,
  };
}

export function parseDraftJson(raw: string): ConvocatoriaDraft {
  const draft = JSON.parse(raw) as ConvocatoriaDraft;
  if (!draft.categories || !Array.isArray(draft.categories)) {
    throw new Error("Borrador sin categorías");
  }
  return normalizeConvocatoriaDraft(draft);
}
