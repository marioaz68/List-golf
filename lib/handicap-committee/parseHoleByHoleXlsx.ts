/**
 * Parser del export USGA "Hole by Hole Scores Report".
 * Aplica forward-fill de GHIN/nombre (formato agrupado del portal).
 * Fechas: prioriza Date de Excel; strings ambiguas day≤12 & month≤12 se marcan.
 */

export type ParsedGhinRound = {
  ghin_number: string;
  golfer_name: string;
  gender: "M" | "F";
  date_played: string; // YYYY-MM-DD
  date_ambiguous: boolean;
  score_type: string | null;
  tee_name: string;
  tee_cr: number | null;
  tee_sr: number | null;
  hi_at_play: number | null;
  course_handicap: number | null;
  total_score: number;
  differential: number | null;
  holes: (number | null)[]; // length 18
  source_row: number;
};

export type ParseHoleByHoleResult = {
  rows: ParsedGhinRound[];
  warnings: string[];
  headerMap: Record<string, number>;
};

function normHeader(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cellStr(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if ("text" in o) return String(o.text ?? "").trim();
    if ("result" in o) return String(o.result ?? "").trim();
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[])
        .map((t) => t.text ?? "")
        .join("")
        .trim();
    }
    if (v instanceof Date) return "";
  }
  return String(v).trim();
}

function cellNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "object" && v !== null && "result" in v) {
    return cellNum((v as { result: unknown }).result);
  }
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Excel serial → YYYY-MM-DD (UTC noon-ish via Excel epoch). */
function excelSerialToIso(serial: number): string {
  // Excel 1900 date system
  const utc = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return new Date(utc).toISOString().slice(0, 10);
}

/**
 * Parsea fecha. Marca ambiguous si string tipo d/m/y con ambos ≤12.
 */
export function parsePlayedDate(v: unknown): {
  iso: string | null;
  ambiguous: boolean;
} {
  if (v == null || v === "") return { iso: null, ambiguous: false };
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return { iso: v.toISOString().slice(0, 10), ambiguous: false };
  }
  if (typeof v === "number" && Number.isFinite(v)) {
    return { iso: excelSerialToIso(v), ambiguous: false };
  }
  if (typeof v === "object" && v !== null) {
    const o = v as { result?: unknown; text?: unknown };
    if (o.result != null) return parsePlayedDate(o.result);
    if (o.text != null) return parsePlayedDate(o.text);
  }
  const s = String(v).trim();
  // ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return { iso: s.slice(0, 10), ambiguous: false };
  }
  // M/D/Y or D/M/Y
  const m = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/.exec(s);
  if (!m) return { iso: null, ambiguous: false };
  let a = Number(m[1]);
  let b = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const ambiguous = a <= 12 && b <= 12 && a !== b;
  // Prefer US M/D/Y if Chrome may have flipped — we flag; default treat as M/D/Y
  // when first > 12 it's clearly D-first European... if a>12 then D/M/Y
  let month: number;
  let day: number;
  if (a > 12) {
    day = a;
    month = b;
  } else if (b > 12) {
    month = a;
    day = b;
  } else {
    // Ambiguous: keep as M/D/Y (portal US) but flag
    month = a;
    day = b;
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { iso: null, ambiguous };
  }
  const iso = `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, ambiguous };
}

function findCol(headers: string[], aliases: string[]): number {
  for (const a of aliases) {
    const i = headers.findIndex((h) => h === a || h.includes(a));
    if (i >= 0) return i;
  }
  return -1;
}

export async function parseHoleByHoleXlsx(
  buffer: ArrayBuffer,
  gender: "M" | "F"
): Promise<ParseHoleByHoleResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  // exceljs Buffer typing vs Node Buffer mismatch across versions
  await wb.xlsx.load(Buffer.from(buffer) as never);
  const ws = wb.worksheets[0];
  if (!ws) {
    return { rows: [], warnings: ["El archivo no tiene hojas"], headerMap: {} };
  }

  const warnings: string[] = [];
  let headers: string[] = [];
  let headerRow = 1;

  // Buscar fila de encabezados (primera con "ghin" o "golfer")
  for (let r = 1; r <= Math.min(15, ws.rowCount); r++) {
    const row = ws.getRow(r);
    const vals: string[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      vals[col - 1] = normHeader(cellStr(c.value));
    });
    if (
      vals.some((h) => h.includes("ghin") || h.includes("golfer id")) &&
      vals.some((h) => h.includes("date") || h.includes("fecha"))
    ) {
      headers = vals;
      headerRow = r;
      break;
    }
  }

  if (!headers.length) {
    return {
      rows: [],
      warnings: ["No se encontró fila de encabezados (GHIN + Date)."],
      headerMap: {},
    };
  }

  const col = {
    ghin: findCol(headers, ["ghin", "golfer id", "player id"]),
    name: findCol(headers, ["golfer name", "player name", "nombre", "name"]),
    date: findCol(headers, ["date played", "date", "fecha"]),
    scoreType: findCol(headers, ["score type", "type", "tipo"]),
    tee: findCol(headers, ["tee name", "tee", "tee set"]),
    cr: findCol(headers, ["course rating", "cr", "rating"]),
    sr: findCol(headers, ["slope rating", "slope", "sr"]),
    hi: findCol(headers, ["handicap index", "hi at play", "hi", "index"]),
    ch: findCol(headers, ["course handicap", "ch"]),
    total: findCol(headers, [
      "adjusted gross score",
      "total score",
      "score",
      "ags",
      "total",
    ]),
    diff: findCol(headers, ["differential", "diff", "score differential"]),
  };

  const holeCols: number[] = [];
  for (let h = 1; h <= 18; h++) {
    const i = findCol(headers, [
      `hole ${h}`,
      `hoyo ${h}`,
      `h${h}`,
      String(h),
    ]);
    holeCols.push(i);
  }

  if (col.ghin < 0 || col.date < 0 || col.total < 0 || col.tee < 0) {
    warnings.push(
      `Columnas faltantes: ghin=${col.ghin} date=${col.date} tee=${col.tee} total=${col.total}`
    );
  }

  const rows: ParsedGhinRound[] = [];
  let lastGhin = "";
  let lastName = "";
  let ambiguousCount = 0;

  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const get = (idx: number) =>
      idx >= 0 ? row.getCell(idx + 1).value : null;

    let ghin = cellStr(get(col.ghin)).replace(/\D/g, "");
    let name = cellStr(get(col.name));
    if (ghin) lastGhin = ghin;
    else ghin = lastGhin;
    if (name) lastName = name;
    else name = lastName;

    const dateRaw = get(col.date);
    const { iso: date_played, ambiguous } = parsePlayedDate(dateRaw);
    const tee_name = cellStr(get(col.tee));
    const total = cellNum(get(col.total));

    if (!ghin || !date_played || !tee_name || total == null) continue;
    if (ambiguous) ambiguousCount++;

    const holes: (number | null)[] = [];
    for (let h = 0; h < 18; h++) {
      holes.push(cellNum(get(holeCols[h]!)));
    }

    rows.push({
      ghin_number: ghin,
      golfer_name: name || ghin,
      gender,
      date_played,
      date_ambiguous: ambiguous,
      score_type: cellStr(get(col.scoreType)) || null,
      tee_name,
      tee_cr: cellNum(get(col.cr)),
      tee_sr: cellNum(get(col.sr)),
      hi_at_play: cellNum(get(col.hi)),
      course_handicap: cellNum(get(col.ch)),
      total_score: Math.round(total),
      differential: cellNum(get(col.diff)),
      holes,
      source_row: r,
    });
  }

  if (ambiguousCount > 0) {
    warnings.push(
      `${ambiguousCount} fechas con día y mes ≤ 12 (posibles volteos Chrome). Revisar conflictos de fecha.`
    );
  }

  const headerMap: Record<string, number> = {};
  for (const [k, v] of Object.entries(col)) headerMap[k] = v as number;

  return { rows, warnings, headerMap };
}
