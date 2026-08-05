/** Parsea input de distancia a cm.
 *  Acepta metros (1.25 o 1,25), centímetros enteros si "cm", o pies+pulgadas "5'6\"" / 5-6.
 */
export function parseDistanceToCm(raw: string): number | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;

  // pies + pulgadas: 5'6" | 5' 6 | 5-6
  const feetMatch = s.match(/^(\d+)\s*['′]\s*(\d+(?:[.,]\d+)?)\s*["″]?$/);
  if (feetMatch) {
    const feet = Number(feetMatch[1]);
    const inches = Number(String(feetMatch[2]).replace(",", "."));
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    const totalIn = feet * 12 + inches;
    return Math.round(totalIn * 2.54);
  }
  const dashFeet = s.match(/^(\d+)\s*-\s*(\d+(?:[.,]\d+)?)$/);
  if (dashFeet) {
    const feet = Number(dashFeet[1]);
    const inches = Number(String(dashFeet[2]).replace(",", "."));
    if (!Number.isFinite(feet) || !Number.isFinite(inches)) return null;
    return Math.round((feet * 12 + inches) * 2.54);
  }

  // con unidad
  const cmUnit = s.match(/^(\d+(?:[.,]\d+)?)\s*cm$/);
  if (cmUnit) {
    const v = Number(String(cmUnit[1]).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return null;
    return Math.round(v);
  }
  const mUnit = s.match(/^(\d+(?:[.,]\d+)?)\s*m(?:ts?|etros?)?$/);
  if (mUnit) {
    const v = Number(String(mUnit[1]).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return null;
    return Math.round(v * 100);
  }
  const ftUnit = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:ft|pies?|')$/);
  if (ftUnit) {
    const v = Number(String(ftUnit[1]).replace(",", "."));
    if (!Number.isFinite(v) || v < 0) return null;
    return Math.round(v * 30.48);
  }

  // número solo: si ≥ 100 y sin decimales → asumir cm; si no → metros
  const n = Number(s.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  if (Number.isInteger(n) && n >= 100) return Math.round(n);
  return Math.round(n * 100);
}

export function formatDistanceCm(cm: number | null | undefined): string {
  if (cm == null || !Number.isFinite(cm)) return "—";
  if (cm < 100) return `${Math.round(cm)} cm`;
  const m = cm / 100;
  if (m < 10) return `${m.toFixed(2)} m`;
  return `${m.toFixed(1)} m`;
}

/** Valor editable preferido en metros con 2 decimales. */
export function distanceCmToInputMeters(cm: number | null | undefined): string {
  if (cm == null || !Number.isFinite(cm)) return "";
  const m = cm / 100;
  if (Number.isInteger(m)) return String(m);
  return m.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}
