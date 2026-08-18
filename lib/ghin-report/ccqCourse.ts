/** Campo Club Campestre de Querétaro — constantes del comité. */

export const CCQ_PAR = 72;

export type CcqTeeCode = "Negras" | "Azules" | "Blancas" | "Doradas";

export type CcqTee = {
  code: CcqTeeCode;
  cr: number;
  slope: number;
  par: number;
};

/** CR / Slope hombres (el Match Play de parejas caballeros no usa Negras). */
export const CCQ_TEES_MEN: Record<CcqTeeCode, CcqTee> = {
  Negras: { code: "Negras", cr: 73.2, slope: 138, par: CCQ_PAR },
  Azules: { code: "Azules", cr: 72.7, slope: 136, par: CCQ_PAR },
  Blancas: { code: "Blancas", cr: 70.7, slope: 127, par: CCQ_PAR },
  Doradas: { code: "Doradas", cr: 67.0, slope: 125, par: CCQ_PAR },
};

/** Stroke index hoyos 1–18. */
export const CCQ_STROKE_INDEX: number[] = [
  13, 1, 15, 7, 3, 5, 11, 17, 9, 6, 14, 18, 8, 12, 10, 2, 16, 4,
];

/** Par hoyos 1–18. */
export const CCQ_HOLE_PAR: number[] = [
  4, 4, 3, 5, 4, 4, 4, 3, 5, 4, 5, 3, 4, 5, 4, 4, 3, 4,
];

/**
 * Ventana de HI del Calcuta Varonil 2026 (convocatoria).
 * Usada con f_ghin_min_index cuando no hay inscripción.
 */
export const CALCUTA_2026_HI_WINDOW = {
  desde: "2026-05-01",
  hasta: "2026-08-01",
} as const;

/** Corte de índice → tee (si no manda la regla de 80 % de tarjetas). */
export const TEE_HI_CUTOFF = 6.9;

/** Mapea código/nombre/motivo de salida a tee CCQ. Blancas antes que Azules
 *  para que un ajuste «de azules a blancas» no se quede en Azules. */
export function ccqTeeFromLabel(raw: string | null | undefined): CcqTeeCode | null {
  const n = String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (!n.trim()) return null;
  if (n.includes("blanc") || n.includes("wht")) return "Blancas";
  if (n.includes("dorad") || n.includes("gld") || n.includes("oro")) return "Doradas";
  if (n.includes("negr") || n.includes("blk")) return "Negras";
  if (n.includes("azul") || n.includes("blu")) return "Azules";
  return null;
}
