/** Extrae número GHIN del nombre de archivo (sin extensión). */
export function extractGhinFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, "").trim();
  if (!base) return null;

  // Exacto: solo dígitos (ej. 1113456.html)
  if (/^\d{4,10}$/.test(base)) return base;

  // Prefijo: 1113456_lo-que-sea o 1113456-lo que sea
  const m = base.match(/^(\d{4,10})(?:[_\-\s.].*)?$/);
  return m?.[1] ?? null;
}

export const PLAYER_FILE_ACCEPT =
  ".html,.htm,.pdf,.jpg,.jpeg,.png,.webp,text/html,application/pdf,image/*";

export function mimeFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "html":
    case "htm":
      return "text/html";
    case "pdf":
      return "application/pdf";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}
