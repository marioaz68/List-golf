import { extractDocxText } from "./extractDocxText";
import { extractPdfText } from "./extractPdfText";
import { extractXlsxText } from "./extractXlsxText";

export type SupportedConvocatoriaExt = "docx" | "pdf" | "xlsx" | "xls";

const EXT_BY_MIME: Record<string, SupportedConvocatoriaExt> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
};

export function detectConvocatoriaExt(file: File): SupportedConvocatoriaExt | null {
  const fromName = file.name.toLowerCase().split(".").pop()?.trim() ?? "";
  if (fromName === "docx" || fromName === "pdf" || fromName === "xlsx" || fromName === "xls") {
    return fromName;
  }
  if (file.type && EXT_BY_MIME[file.type]) return EXT_BY_MIME[file.type];
  return null;
}

/**
 * Extrae texto plano de un archivo de convocatoria (.docx, .pdf, .xlsx, .xls).
 * Devuelve un string con saltos de línea, listo para parseConvocatoriaText.
 */
export async function extractConvocatoriaText(file: File): Promise<{
  ext: SupportedConvocatoriaExt;
  text: string;
}> {
  const ext = detectConvocatoriaExt(file);
  if (!ext) {
    throw new Error(
      "Formato no soportado. Usa .docx, .pdf, .xlsx o .xls."
    );
  }
  const buffer = Buffer.from(await file.arrayBuffer());

  switch (ext) {
    case "docx":
      return { ext, text: await extractDocxText(buffer) };
    case "pdf":
      return { ext, text: await extractPdfText(buffer) };
    case "xlsx":
    case "xls":
      return { ext, text: await extractXlsxText(buffer) };
  }
}
