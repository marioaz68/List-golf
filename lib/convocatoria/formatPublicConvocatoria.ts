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

/** Detecta encabezados de la convocatoria (líneas cortas en mayúsculas). */
function isLikelyHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/^\d+(\.|°|:)?$/.test(trimmed)) return false;
  const letters = trimmed.replace(/[^A-Za-zÁÉÍÓÚÑÜáéíóúñü]/g, "");
  if (letters.length < 3) return false;
  const upper = letters.replace(/[áéíóúñü]/g, (c) => c.toUpperCase());
  return upper === upper.toUpperCase() && upper === letters.toUpperCase();
}

/** Repite líneas de portada como "68VO. TORNEO ANUAL. - CONVOCATORIA" que se omiten. */
function isPortadaRepeat(line: string): boolean {
  return /^(6[78]VO\.\s*TORNEO ANUAL\.?\s*-\s*CONVOCATORIA)$/i.test(line.trim());
}

function looksLikeFlattenedTable(body: string): boolean {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 6) return false;
  const shortLines = lines.filter((l) => l.length <= 20).length;
  return shortLines / lines.length >= 0.7;
}

/** Divide el texto extraído del Word en secciones legibles para la página pública. */
export function parseExtractedConvocatoriaSections(
  text: string,
  fallbackTitle: string
): PublicConvocatoriaSection[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !isPortadaRepeat(l));

  if (lines.length === 0) return [];

  const sections: PublicConvocatoriaSection[] = [];
  let currentHeading = fallbackTitle;
  let currentBody: string[] = [];

  const flush = () => {
    const body = currentBody.join("\n").trim();
    if (body || sections.length === 0) {
      sections.push({ heading: currentHeading, body });
    }
    currentBody = [];
  };

  for (const line of lines) {
    if (isLikelyHeading(line)) {
      flush();
      currentHeading = line;
      continue;
    }
    currentBody.push(line);
  }
  flush();

  // Filtra tablas aplastadas (CATEGORÍAS, DAMAS, CABALLEROS, STABLEFORD,
  // DÍAS DE JUEGO Y HORARIOS DE SALIDA, PREMIOS AL MEJOR O'YES…) que se
  // ven como una lista vertical de palabras sueltas, sin sentido para la pública.
  // El detalle correcto vive en Programa de Eventos y en las pestañas Inscritos/Reglas.
  return sections.filter((s) => {
    if (s.heading === fallbackTitle && !s.body) return false;
    if (!s.body) return true;
    return !looksLikeFlattenedTable(s.body);
  });
}

export function buildPublicConvocatoriaSections(
  draft: ConvocatoriaDraft,
  labels: PublicConvocatoriaRefLabels,
  options?: { extractedText?: string | null }
): PublicConvocatoriaSection[] {
  const d = normalizeConvocatoriaDraft(draft);
  const title = d.meta.title?.trim() || "Convocatoria";

  // Si tenemos el texto del Word, mostrarlo idéntico (organizado en secciones).
  const extracted = options?.extractedText?.trim();
  if (extracted) {
    const fromDoc = parseExtractedConvocatoriaSections(extracted, title);
    if (fromDoc.length > 0) return fromDoc;
  }

  // Si no hay Word: caer en el resumen procesado del draft.
  const sections: PublicConvocatoriaSection[] = [];

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

  return sections;
}
