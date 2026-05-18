import type { CategoryCompetitionRule } from "./categoryCompetitionRules";
import { normalizeCompetitionRule } from "./categoryCompetitionRules";

/**
 * Regla obligatoria por categoría. No usar defaults inventados:
 * la página pública debe bloquearse antes si falta configuración.
 */
export function competitionRuleForCategory(
  rulesMap: Map<string, CategoryCompetitionRule>,
  categoryId: string | null | undefined
): CategoryCompetitionRule {
  const id = String(categoryId ?? "").trim();
  if (!id) {
    throw new Error("[competition] Fila sin category_id");
  }
  const rule = rulesMap.get(id);
  if (!rule) {
    throw new Error(
      `[competition] Sin regla activa para categoría ${id}. Configura Competencia.`
    );
  }
  return normalizeCompetitionRule(rule);
}
