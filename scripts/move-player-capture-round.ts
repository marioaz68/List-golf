/**
 * Mueve captura entre rondas lógicas (misma categoría del inscrito).
 * Uso: npx tsx scripts/move-player-capture-round.ts <tournament_id> <player_number> <from_round_no> <to_round_no>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { moveCaptureBetweenRoundNos } from "../lib/scorecards/moveCaptureBetweenRoundNos";

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
const playerNumber = Number(process.argv[3]);
const fromRoundNo = Number(process.argv[4]);
const toRoundNo = Number(process.argv[5]);

if (
  !tournamentId ||
  !Number.isFinite(playerNumber) ||
  !Number.isFinite(fromRoundNo) ||
  !Number.isFinite(toRoundNo)
) {
  console.error(
    "Uso: npx tsx scripts/move-player-capture-round.ts <tournament_id> <player_number> <from_round_no> <to_round_no>"
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

  const { data: entry, error } = await admin
    .from("tournament_entries")
    .select("id, player_id, player_number")
    .eq("tournament_id", tournamentId)
    .eq("player_number", playerNumber)
    .maybeSingle();

  if (error || !entry) {
    console.error("Inscripción no encontrada:", error?.message ?? "");
    process.exit(1);
  }

  const result = await moveCaptureBetweenRoundNos(admin, {
    tournamentId,
    entryId: entry.id,
    playerId: String(entry.player_id),
    fromRoundNo,
    toRoundNo,
    lockTargetScorecard: true,
  });

  console.log("\n=== Captura movida ===");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
