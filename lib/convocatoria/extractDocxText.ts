import JSZip from "jszip";

/** Extrae párrafos de un .docx (Office Open XML). */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file("word/document.xml");
  if (!file) {
    throw new Error("El archivo DOCX no contiene word/document.xml");
  }
  const xml = await file.async("string");
  const paragraphs = xml.match(/<w:p[\s\S]*?<\/w:p>/g) ?? [];
  const lines: string[] = [];

  for (const para of paragraphs) {
    const parts = [...para.matchAll(/<w:t[^>]*>([^<]*)<\/w:t>/g)].map(
      (m) => m[1]
    );
    const line = parts.join("").trim();
    if (line) lines.push(line);
  }

  return lines.join("\n");
}
