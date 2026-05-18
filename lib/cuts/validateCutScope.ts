export type CutScopeType =
  | "category"
  | "category_group"
  | "category_code_list"
  | "overall";

/** Evita grupos de una letra (ej. "D") que aplican a DE y DC a la vez. */
export function validateCutScopeValue(
  scopeType: CutScopeType,
  scopeValue: string
): string | null {
  if (scopeType === "overall") return null;

  const value = String(scopeValue ?? "").trim();
  if (!value) {
    return "Falta el alcance de la regla (categoría o grupo).";
  }

  if (scopeType === "category_group") {
    const group = value.toUpperCase();
    if (group.length < 2) {
      return `El grupo de categorías "${group}" es demasiado corto: usa el código exacto (ej. DE) o un prefijo de al menos 2 letras.`;
    }
  }

  return null;
}
