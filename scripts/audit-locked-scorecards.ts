/**
 * Lista jugadores con cierre en categoría equivocada o sin cierre en la ronda correcta.
 * Uso: npx tsx scripts/audit-locked-scorecards.ts <tournament_id>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { listMisalignedLockedScorecardsForTournament } from "../lib/scorecards/listMisalignedLockedScorecards";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const k = m[1].trim();
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const tournamentId = process.argv[2]?.trim();
if (!tournamentId) {
  console.error("Uso: npx tsx scripts/audit-locked-scorecards.ts <tournament_id>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

async function main() {
  const admin = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = await listMisalignedLockedScorecardsForTournament(
    admin,
    tournamentId!
  );

  const wrong = rows.filter((r) => r.kind === "lock_wrong_category");
  const needClose = rows.filter((r) => r.kind === "needs_close_on_correct_round");
  const wrongWith18 = wrong.filter((r) => r.hole_count_on_correct >= 18);
  const wrongZero = wrong.filter((r) => r.hole_count_on_correct === 0);

  console.log("\n=== Resumen ===");
  console.log(
    `Cierre en otra categoría: ${wrong.length} (de esos, ${wrongWith18.length} ya tienen 18 hoyos en la correcta → solo cerrar ahí; ${wrongZero.length} sin scores en la correcta → revisar captura)`
  );
  console.log(`Falta cerrar en categoría correcta (18 hoyos): ${needClose.length}`);

  console.log("\n=== Cierre en categoría equivocada (acción) ===");
  console.log(`Prioridad — 18 hoyos en correcta: ${wrongWith18.length}`);
  for (const r of wrongWith18.slice(0, 25)) {
    console.log(
      `#${r.player_number ?? "?"} ${r.player_name} | R${r.round_no} | cerrado ${r.locked_round_category_code} → usar ${r.correct_round_category_code}`
    );
  }
  if (wrongWith18.length > 25) console.log(`… y ${wrongWith18.length - 25} más`);

  console.log("\n=== Cierre en categoría equivocada (resto) ===");
  console.log(`Total listado: ${wrong.length}`);
  for (const r of wrong.slice(0, 30)) {
    console.log(
      `#${r.player_number ?? "?"} ${r.player_name} | R${r.round_no} | inscrito ${r.entry_category_code} | cerrado en ${r.locked_round_category_code} | correcto ${r.correct_round_category_code} | ${r.hole_count_on_correct}/18 en correcta`
    );
  }
  if (wrong.length > 30) console.log(`… y ${wrong.length - 30} más`);

  console.log("\n=== Tiene 18 hoyos en categoría correcta pero NO cerrado ahí ===");
  console.log(`Total: ${needClose.length}`);
  for (const r of needClose.slice(0, 30)) {
    console.log(
      `#${r.player_number ?? "?"} ${r.player_name} | R${r.round_no} | ${r.entry_category_code} | ${r.hole_count_on_correct} hoyos → cerrar en score-entry`
    );
  }
  if (needClose.length > 30) console.log(`… y ${needClose.length - 30} más`);

  console.log("\n(JSON completo en stdout siguiente línea si pipe a archivo)\n");
  console.log(JSON.stringify({ wrong, needClose }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
