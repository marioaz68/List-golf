import { normalizeConvocatoriaDraft, normalizeWorkflowStatus } from "./draftUtils";
import type { ConvocatoriaDraft, ConvocatoriaReference } from "./types";

export type PublicConvocatoriaSection = {
  heading: string;
  body: string;
};

export type PublicConvocatoriaRefLabels = {
  generalHeading: string;
  metaPracticeDay: string;
  metaHandicapDate: string;
  metaRounds: string;
  metaHoles: string;
  metaCutHoles: string;
  metaCutPct: string;
  categoriesHeading: string;
} & Record<keyof ConvocatoriaReference, string>;

const REFERENCE_KEYS: (keyof ConvocatoriaReference)[] = [
  "system",
  "gentlemen",
  "ladies",
  "seniors_ages",
  "cut_policy",
  "cut_tiebreak_gross",
  "cut_tiebreak_stableford",
  "cut_tiebreak_seniors",
  "trophy_tiebreak",
  "trophies",
  "out_of_scope",
];

export function isConvocatoriaPublicVisible(
  status: string | null | undefined
): boolean {
  const normalized = normalizeWorkflowStatus(status);
  return normalized === "closed" || normalized === "applied";
}

export function buildPublicConvocatoriaSections(
  draft: ConvocatoriaDraft,
  labels: PublicConvocatoriaRefLabels,
  options?: { extractedText?: string | null }
): PublicConvocatoriaSection[] {
  const d = normalizeConvocatoriaDraft(draft);
  const sections: PublicConvocatoriaSection[] = [];

  const title = d.meta.title?.trim();
  if (title) {
    sections.push({ heading: title, body: "" });
  }

  const metaLines: string[] = [];
  if (d.meta.practice_day?.trim()) {
    metaLines.push(`${labels.metaPracticeDay}: ${d.meta.practice_day.trim()}`);
  }
  if (d.meta.handicap_index_date?.trim()) {
    metaLines.push(
      `${labels.metaHandicapDate}: ${d.meta.handicap_index_date.trim()}`
    );
  }
  if (d.meta.total_holes != null) {
    metaLines.push(`${labels.metaHoles}: ${d.meta.total_holes}`);
  }
  if (d.meta.cut_after_holes != null) {
    metaLines.push(`${labels.metaCutHoles}: ${d.meta.cut_after_holes}`);
  }
  if (d.meta.cut_percent != null) {
    metaLines.push(`${labels.metaCutPct}: ${d.meta.cut_percent}%`);
  }
  if (d.meta.round_count != null) {
    metaLines.push(`${labels.metaRounds}: ${d.meta.round_count}`);
  }
  if (metaLines.length > 0) {
    sections.push({
      heading: labels.metaPracticeDay.split(":")[0] ?? "Datos generales",
      body: metaLines.join("\n"),
    });
  }

  const ref = d.reference;
  if (ref) {
    for (const key of REFERENCE_KEYS) {
      const body = ref[key]?.trim();
      if (!body) continue;
      sections.push({ heading: labels[key], body });
    }
  }

  if (d.categories.length > 0) {
    const lines = d.categories.map((c) => {
      const parts = [
        `${c.code} — ${c.name}`,
        `H.I. ${c.handicap_min}–${c.handicap_max}`,
        c.has_cut ? "con corte" : "sin corte",
      ];
      if (c.format_notes?.trim()) parts.push(c.format_notes.trim());
      return parts.join(" · ");
    });
    sections.push({
      heading: labels.categoriesHeading,
      body: lines.join("\n"),
    });
  }

  const extracted = options?.extractedText?.trim();
  if (sections.length === 0 && extracted) {
    return [{ heading: title || "Convocatoria", body: extracted }];
  }

  return sections;
}
