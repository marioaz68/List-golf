import type { RoundAdvancementRule } from "./computeCutLine";

/** Misma base que el resumen de inscripciones: todos salvo retirados/cancelados (DQ sí cuenta para el %). */
export function isInscribedForCutFieldSize(
  status: string | null | undefined
): boolean {
  const s = (status ?? "").toLowerCase();
  return s !== "withdrawn" && s !== "cancelled";
}

export type RankedForCut = {
  entryId: string;
  primaryValue: number | null;
};

/**
 * Plazas que pasan (top_percent: % del campo inscrito, redondeo a la baja).
 * El tamaño del campo es el total de inscritos; sin score no ocupan plaza.
 */
export function cutSlotsFromRule(
  rule: RoundAdvancementRule,
  fieldSize: number
): number {
  if (fieldSize <= 0) return 0;
  if (rule.advancement_type === "all") return fieldSize;
  if (rule.advancement_type === "top_percent") {
    const pct = Math.max(0, Math.min(100, Number(rule.advancement_value)));
    return Math.max(1, Math.floor((fieldSize * pct) / 100));
  }
  return Math.max(1, Math.trunc(Number(rule.advancement_value)));
}

/**
 * Pasan exactamente `cutSlots` jugadores. La lista debe venir ordenada con
 * ranking + perfil de desempate; en el límite el desempate define quién entra.
 * Nunca se incluyen “todos los empatados” por encima del cupo.
 */
export function entryIdsMakingCut(
  sortedEligible: RankedForCut[],
  cutSlots: number
): Set<string> {
  if (cutSlots <= 0 || sortedEligible.length === 0) return new Set();

  const topN = Math.min(cutSlots, sortedEligible.length);
  return new Set(sortedEligible.slice(0, topN).map((r) => r.entryId));
}

/** Inscritos por categoría (mismo criterio que resumen Inscripciones). */
export function buildInscribedCountByCategory(
  entries: Array<{ category_id: string | null; status?: string | null }>
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    if (!isInscribedForCutFieldSize(entry.status)) continue;
    const categoryId = String(entry.category_id ?? "").trim();
    if (!categoryId) continue;
    counts.set(categoryId, (counts.get(categoryId) ?? 0) + 1);
  }
  return counts;
}

/** Categorías con inscritos y/o filas en clasificación (corte por categoría). */
export function categoryIdsForCutComputation(
  selectedCategoryId: string | null,
  inscribedCountByCategoryId: Map<string, number> | undefined,
  leaderboard: Array<{ category_id: string | null }>
): string[] {
  if (selectedCategoryId) return [selectedCategoryId];

  const ids = new Set<string>();
  for (const [id, count] of inscribedCountByCategoryId ?? []) {
    if (count > 0) ids.add(id);
  }
  for (const row of leaderboard) {
    const id = String(row.category_id ?? "").trim();
    if (id) ids.add(id);
  }
  return [...ids];
}
