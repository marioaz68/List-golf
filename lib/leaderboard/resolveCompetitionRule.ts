import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { normalizeCompetitionRule } from "./categoryCompetitionRules";

/**
 * Regla obligatoria por categoría. No usar defaults inventados:
 * la página pública debe bloquearse antes si falta configuración.
 */
/** Regla por categoría; null si falta id o configuración (no lanzar en página pública). */
export function competitionRuleForCategory(
  rulesMap: Map<string, CategoryCompetitionRule>,
  categoryId: string | null | undefined
): CategoryCompetitionRule | null {
  const id = String(categoryId ?? "").trim();
  if (!id) return null;
  const rule = rulesMap.get(id);
  if (!rule) return null;
  return normalizeCompetitionRule(rule);
}
