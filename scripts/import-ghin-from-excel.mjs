/**
 * Import GHIN numbers from Excel into players.ghin_number
 * Usage: node scripts/import-ghin-from-excel.mjs <path.xlsx> [--apply]
 */
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const EXCEL_DEFAULT =
  "/Users/marioalvarez/Downloads/Handicaps_MATCH_PLAY_PAREJAS_MIXTO_2026_con_GHINs.xlsx";

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
  const ws = wb.worksheets[0];
  const rows = [];
  let header = null;
  ws.eachRow((row, rn) => {
    if (rn === 1) {
      const vals = [];
      row.eachCell({ includeEmpty: true }, (c, col) => {
        vals[col - 1] = norm(cellStr(c.value));
      });
      header = vals;
      return;
    }
    const vals = [];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      vals[col - 1] = cellStr(c.value);
    });
    const ghinIdx = header?.indexOf("ghin") ?? 1;
    const nameIdx = header?.indexOf("nombre") ?? 2;
    const ghin = vals[ghinIdx]?.replace(/\D/g, "") || "";
    const nombre = vals[nameIdx]?.trim() || "";
    if (!nombre || !ghin) return;
    rows.push({ nombre, ghin, row: rn });
  });
  return rows;
}

function fullName(p) {
  return `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim();
}

async function main() {
  loadEnv();
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const excelPath = args.find((a) => !a.startsWith("-")) || EXCEL_DEFAULT;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  const excelRows = await readExcel(excelPath);
  console.log(`Excel: ${excelRows.length} filas con GHIN en ${excelPath}\n`);

  const { data: tournaments, error: tErr } = await supabase
    .from("tournaments")
    .select("id, name")
    .or(
      "name.ilike.%match%play%parejas%mixto%,name.ilike.%match play parejas%mixto%"
    )
    .order("created_at", { ascending: false })
    .limit(5);

  if (tErr) throw tErr;
  if (!tournaments?.length) {
    console.error("No se encontró torneo MATCH PLAY PAREJAS MIXTO");
    process.exit(1);
  }

  const tournament = tournaments[0];
  console.log(`Torneo: ${tournament.name} (${tournament.id})\n`);

  const { data: entries, error: eErr } = await supabase
    .from("tournament_entries")
    .select(
      "id, player_id, player:players(id, first_name, last_name, ghin_number)"
    )
    .eq("tournament_id", tournament.id);

  if (eErr) throw eErr;

  const byNorm = new Map();
  for (const e of entries ?? []) {
    const p = e.player;
    if (!p?.id) continue;
    const n = norm(fullName(p));
    if (!byNorm.has(n)) byNorm.set(n, []);
    byNorm.get(n).push(p);
  }

  const updates = [];
  const unmatched = [];
  const skipped = [];

  for (const { nombre, ghin, row } of excelRows) {
    const n = norm(nombre);
    const candidates = byNorm.get(n);
    if (!candidates?.length) {
      unmatched.push({ row, nombre, ghin });
      continue;
    }
    if (candidates.length > 1) {
      unmatched.push({
        row,
        nombre,
        ghin,
        reason: `ambiguo (${candidates.length} jugadores)`,
      });
      continue;
    }
    const p = candidates[0];
    const current = (p.ghin_number ?? "").replace(/\D/g, "");
    if (current === ghin) {
      skipped.push({ nombre, ghin, player_id: p.id });
      continue;
    }
    updates.push({
      player_id: p.id,
      nombre,
      ghin,
      old: p.ghin_number,
    });
  }

  console.log("=== RESUMEN ===");
  console.log(`Actualizar: ${updates.length}`);
  console.log(`Ya correctos: ${skipped.length}`);
  console.log(`Sin match: ${unmatched.length}\n`);

  if (updates.length) {
    console.log("--- A actualizar ---");
    for (const u of updates) {
      console.log(
        `  ${u.nombre} → GHIN ${u.ghin}${u.old ? ` (antes: ${u.old})` : ""}`
      );
    }
    console.log();
  }

  if (unmatched.length) {
    console.log("--- Sin match ---");
    for (const u of unmatched) {
      console.log(
        `  fila ${u.row}: ${u.nombre}${u.reason ? ` — ${u.reason}` : ""}`
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
  for (const u of updates) {
    const { error } = await supabase
      .from("players")
      .update({ ghin_number: u.ghin })
      .eq("id", u.player_id);
    if (error) {
      console.error(`FAIL ${u.nombre}:`, error.message);
      fail++;
    } else {
      ok++;
    }
  }

  console.log(`\nGuardado: ${ok} ok, ${fail} errores`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
