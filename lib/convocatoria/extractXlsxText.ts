import ExcelJS from "exceljs";

/**
 * Extrae texto plano de un .xlsx / .xls combinando todas las hojas.
 * - Cada hoja se separa con un encabezado "=== Hoja: <nombre> ===".
 * - Filas se unen por tabulación; columnas vacías se omiten al final.
 */
export async function extractXlsxText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const parts: string[] = [];

  workbook.eachSheet((sheet) => {
    const name = sheet.name || `Hoja ${sheet.id}`;
    parts.push(`=== Hoja: ${name} ===`);

    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        const value = cell.value as unknown;
        let text = "";
        if (value === null || value === undefined) {
          text = "";
        } else if (
          typeof value === "string" ||
          typeof value === "number" ||
          typeof value === "boolean"
        ) {
          text = String(value);
        } else if (value instanceof Date) {
          text = value.toISOString().slice(0, 10);
        } else if (typeof value === "object") {
          const v = value as Record<string, unknown>;
          if (Array.isArray(v.richText)) {
            const rich = v.richText as Array<{ text?: string }>;
            text = rich.map((p) => p.text ?? "").join("");
          } else if (typeof v.text === "string" || typeof v.text === "number") {
            text = String(v.text);
          } else if (
            typeof v.result === "string" ||
            typeof v.result === "number" ||
            typeof v.result === "boolean"
          ) {
            text = String(v.result);
          } else if (typeof v.formula === "string") {
            text = `=${v.formula}`;
          } else {
            text = JSON.stringify(value);
          }
        } else {
          text = String(value);
        }
        text = text.trim();
        if (text) cells.push(text);
      });
      if (cells.length) parts.push(cells.join("\t"));
    });

    parts.push("");
  });

  return parts.join("\n").trim();
}
