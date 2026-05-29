/**
 * Import GHIN numbers from Excel into players.ghin_number (sistema completo).
 *
 * El Excel tiene una hoja por club. Cada hoja con columnas:
 *   # | GHIN | Nombre | Sexo | HI | Año Nac. | Teléfono | Email | Talla Playera | Talla Zapatos
 *
 * Para cada fila con GHIN no vacío:
 *   1) Normalizamos el nombre del Excel y los nombres de la tabla `players`.
 *   2) Intentamos match exacto por nombre.
 *   3) Si hay varios candidatos, desempatamos por club (nombre de hoja).
 *   4) Actualizamos players.ghin_number en BD.
 *
 * Uso:
 *   node scripts/import-ghin-system-players.mjs <ruta.xlsx>          # vista previa
 *   node scripts/import-ghin-system-players.mjs <ruta.xlsx> --apply  # guarda en BD
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const SKIP_SHEETS = new Set(["_LOG_MATCHES", "_NO_ENCONTRADOS"]);

function loadEnv() {
  const paths = [".env.local", ".env"];
  for (const p of paths) {
    const full = resolve(process.cwd(), p);
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      const v = m[2].trim().replace(/^["']|["']$/g, "");
      if (!process.env[k]) process.env[k] = v;
    }
  }
}

function norm(s) {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cellStr(v) {
  if (v == null) return "";
  if (typeof v === "object") {
    if ("text" in v) return String(v.text).trim();
    if ("result" in v) return String(v.result ?? "").trim();
    if ("richText" in v)
      return v.richText.map((t) => t.text).join("").trim();
  }
  return String(v).trim();
}

async function readExcel(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  /** @type {Array<{ club: string; nombre: string; ghin: string; row: number; sheet: string }>} */
  const rows = [];

  for (const ws of wb.worksheets) {
    const sheet = ws.name;
    if (SKIP_SHEETS.has(sheet)) continue;
    const club = sheet.replace(/_\d+$/, "").trim();

    let header = null;
    ws.eachRow((row, rn) => {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (c, col) => {
        vals[col - 1] = cellStr(c.value);
      });

      if (rn === 1) {
        header = vals.map((v) => norm(v));
        return;
      }

      const ghinIdx = header.indexOf("ghin");
      const nameIdx = header.indexOf("nombre");
      if (ghinIdx < 0 || nameIdx < 0) return;

      const ghin = (vals[ghinIdx] ?? "").replace(/\D/g, "");
      const nombre = (vals[nameIdx] ?? "").trim();
      if (!nombre || !ghin) return;

      rows.push({ club, sheet, nombre, ghin, row: rn });
    });
  }
  return rows;
}

function fullName(p) {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const excelPath = args.find((a) => !a.startsWith("-"));
  if (!excelPath) {
    console.error("Falta la ruta del Excel.");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const excelRows = await readExcel(excelPath);
  console.log(
    `Excel: ${excelRows.length} filas con GHIN no vacío en ${excelPath}\n`
  );
  if (!excelRows.length) {
    console.log("Nada que hacer.");
    return;
  }

  // 1) Cargar todos los jugadores con su club (id + texto + nombre del club).
  const { data: players, error: pErr } = await supabase
    .from("players")
    .select(
      "id, first_name, last_name, club, ghin_number, club_id, clubs:clubs(id, name)"
    );
  if (pErr) throw pErr;

  /** Mapa nombre normalizado → lista de candidatos. */
  const byNorm = new Map();
  for (const p of players ?? []) {
    const n = norm(fullName(p));
    if (!n) continue;
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(p);
  }

  /** @type {Array<{ player_id: string; nombre: string; ghin: string; old: string|null; club: string; sheet: string; row: number }>} */
  const updates = [];
  /** @type {Array<{ row: number; sheet: string; nombre: string; ghin: string; reason?: string; candidates?: number }>} */
  const unmatched = [];
  /** @type {Array<{ nombre: string; ghin: string }>} */
  const skipped = [];

  function clubLabelFor(p) {
    const cName =
      p.clubs && (Array.isArray(p.clubs) ? p.clubs[0]?.name : p.clubs.name);
    return norm(cName ?? p.club ?? "");
  }

  for (const er of excelRows) {
    const n = norm(er.nombre);
    const candidates = byNorm.get(n) ?? [];

    /** Filtramos por club (hoja) cuando hay ambigüedad. */
    let picks = candidates;
    if (candidates.length > 1) {
      const wantClub = norm(er.club);
      const byClub = candidates.filter((p) => clubLabelFor(p) === wantClub);
      if (byClub.length === 1) picks = byClub;
      else if (byClub.length > 1) picks = byClub;
    }

    if (picks.length === 0) {
      unmatched.push({
        row: er.row,
        sheet: er.sheet,
        nombre: er.nombre,
        ghin: er.ghin,
        reason: "no encontrado en players",
      });
      continue;
    }

    if (picks.length > 1) {
      unmatched.push({
        row: er.row,
        sheet: er.sheet,
        nombre: er.nombre,
        ghin: er.ghin,
        reason: "ambiguo (varios jugadores con mismo nombre)",
        candidates: picks.length,
      });
      continue;
    }

    const p = picks[0];
    const current = (p.ghin_number ?? "").replace(/\D/g, "");
    if (current === er.ghin) {
      skipped.push({ nombre: er.nombre, ghin: er.ghin });
      continue;
    }
    updates.push({
      player_id: p.id,
      nombre: er.nombre,
      ghin: er.ghin,
      old: p.ghin_number ?? null,
      club: er.club,
      sheet: er.sheet,
      row: er.row,
    });
  }

  console.log("=== RESUMEN ===");
  console.log(`Actualizar: ${updates.length}`);
  console.log(`Ya correctos: ${skipped.length}`);
  console.log(`Sin match: ${unmatched.length}\n`);

  if (updates.length) {
    console.log("--- A actualizar (primeros 50) ---");
    for (const u of updates.slice(0, 50)) {
      console.log(
        `  [${u.sheet}] ${u.nombre} → GHIN ${u.ghin}${u.old ? ` (antes: ${u.old})` : ""}`
      );
    }
    if (updates.length > 50) console.log(`  … y ${updates.length - 50} más.`);
    console.log();
  }

  if (unmatched.length) {
    console.log("--- Sin match ---");
    for (const u of unmatched) {
      console.log(
        `  [${u.sheet} fila ${u.row}] ${u.nombre} (GHIN ${u.ghin}) — ${u.reason ?? ""}`
      );
    }
    console.log();
  }

  if (!apply) {
    console.log("Modo vista previa. Ejecuta con --apply para guardar en BD.");
    return;
  }

  let ok = 0;
  let fail = 0;
  const failed = [];
  for (const u of updates) {
    const { error } = await supabase
      .from("players")
      .update({ ghin_number: u.ghin })
      .eq("id", u.player_id);
    if (error) {
      failed.push({ nombre: u.nombre, error: error.message });
      fail++;
    } else {
      ok++;
    }
  }
  console.log(`\nGuardado: ${ok} ok, ${fail} errores`);
  if (failed.length) {
    console.log("--- Errores ---");
    for (const f of failed) {
      console.log(`  ${f.nombre}: ${f.error}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
