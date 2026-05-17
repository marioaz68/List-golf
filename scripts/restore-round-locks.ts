/**
 * Restaura cierres de ronda en la categoría correcta (≥18 hoyos).
 * Uso: npx tsx scripts/restore-round-locks.ts <tournament_id> [round_no]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { restoreLocksOnCorrectRound } from "../lib/scorecards/restoreLocksOnCorrectRound";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
    }
  } catch {
    /* ignore */
  }
}

loadEnvLocal();

const tournamentId = process.argv[2]?.trim();
const roundNo = Number(process.argv[3] ?? 1);

async function main() {
  if (!tournamentId) {
    console.error(
      "Uso: npx tsx scripts/restore-round-locks.ts <tournament_id> [round_no]"
    );
    process.exit(1);
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const result = await restoreLocksOnCorrectRound(
    admin,
    tournamentId,
    roundNo
  );

  console.log(`\n=== Restaurar cierres R${roundNo} ===`);
  console.log(`Revisados: ${result.entriesChecked}`);
  console.log(`Ya cerrados: ${result.alreadyLocked}`);
  console.log(`Recién cerrados: ${result.locked}`);
  console.log(`Sin 18 hoyos (omitidos): ${result.skippedNoHoles}`);
  if (result.errors.length) {
    console.log(`Errores (${result.errors.length}):`);
    for (const e of result.errors.slice(0, 20)) console.log(`  ${e}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
