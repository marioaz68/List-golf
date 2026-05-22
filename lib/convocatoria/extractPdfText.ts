/**
 * Extrae texto de un PDF usando pdfjs-dist (build legacy para Node/serverless).
 * No requiere worker porque desactivamos workers en el contexto Node.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // En Node no usamos worker; pdfjs lo soporta cuando se pasa data sin worker.
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableWorker: true,
    isEvalSupported: false,
    useSystemFonts: true,
  } as unknown as Parameters<typeof pdfjs.getDocument>[0]);

  const doc = await loadingTask.promise;
  const pages: string[] = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items as Array<{
      str?: string;
      hasEOL?: boolean;
    }>;

    let lastY: number | null = null;
    const lines: string[] = [];
    let currentLine = "";

    for (const item of items) {
      const str = item.str ?? "";
      if (!str.trim() && !item.hasEOL) continue;

      // pdfjs no provee Y de forma estable en getTextContent simple;
      // basta con romper línea por hasEOL para texto razonable.
      if (item.hasEOL) {
        if (currentLine.trim()) lines.push(currentLine.trim());
        currentLine = "";
        continue;
      }
      currentLine += (currentLine && !currentLine.endsWith(" ") ? " " : "") + str;
    }

    if (currentLine.trim()) lines.push(currentLine.trim());
    pages.push(lines.join("\n"));
    // ahorrar memoria
    page.cleanup();
    void lastY;
  }

  await doc.destroy();
  return pages.join("\n\n");
}
