/** Nombre de archivo seguro para exportaciones Excel. */
export function safeExcelBaseName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\- ]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 72);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Sufijo fecha-hora: 20260528_214530 */
export function excelTimestampSuffix(d = new Date()): string {
  return [
    d.getFullYear(),
    pad2(d.getMonth() + 1),
    pad2(d.getDate()),
    "_",
    pad2(d.getHours()),
    pad2(d.getMinutes()),
    pad2(d.getSeconds()),
  ].join("");
}

const STORAGE_PREFIX = "excel_export_seq:";

/** Siguiente número secuencial por base (persiste en la sesión del navegador). */
export function nextExcelSequence(base: string): number {
  if (typeof sessionStorage === "undefined") return 2;
  const key = STORAGE_PREFIX + base;
  const prev = Number(sessionStorage.getItem(key) ?? "1");
  const next = Number.isFinite(prev) && prev >= 1 ? prev + 1 : 2;
  sessionStorage.setItem(key, String(next));
  return next;
}

export type ExcelNameMode = "unique_seq" | "timestamp" | "fixed";

export function resolveExcelFileName(
  baseTitle: string,
  mode: ExcelNameMode
): string {
  const base = safeExcelBaseName(baseTitle);
  if (mode === "fixed") return `${base}.xlsx`;
  if (mode === "timestamp") {
    return `${base}_${excelTimestampSuffix()}.xlsx`;
  }
  const seq = nextExcelSequence(base);
  return `${base}_${seq}.xlsx`;
}
