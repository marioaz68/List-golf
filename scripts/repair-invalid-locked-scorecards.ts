/**
 * Abre tarjetas cerradas sin 18 hoyos en su ronda.
 * Uso: npx tsx scripts/repair-invalid-locked-scorecards.ts <tournament_id>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  listInvalidLockedScorecardsForTournament,
  repairInvalidLockedScorecardsForTournament,
} from "../lib/scorecards/repairInvalidLockedScorecards";

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
  console.error(
    "Uso: npx tsx scripts/repair-invalid-locked-scorecards.ts <tournament_id>"
  );
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

  const before = await listInvalidLockedScorecardsForTournament(
    admin,
    tournamentId
  );

  console.log(`\nTarjetas cerradas sin 18 hoyos: ${before.length}`);
  for (const r of before.slice(0, 40)) {
    console.log(
      `#${r.player_number ?? "?"} ${r.player_name} | ${r.category_code ?? "?"} | R${r.round_no} | ${r.hole_count}/18`
    );
  }
  if (before.length > 40) {
    console.log(`… y ${before.length - 40} más`);
  }

  const result = await repairInvalidLockedScorecardsForTournament(
    admin,
    tournamentId
  );

  console.log("\n=== Reparación ===");
  console.log(`Encontradas: ${result.found}`);
  console.log(`Abiertas: ${result.unlocked}`);
  if (result.errors.length) {
    console.log("Errores:", result.errors.join("; "));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
