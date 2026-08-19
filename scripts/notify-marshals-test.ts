/**
 * Envía la mini app marshal a los marshals vinculados de un torneo/ronda.
 * Uso:
 *   npx tsx scripts/notify-marshals-test.ts
 *   npx tsx scripts/notify-marshals-test.ts --tournament=5d88f527-35e4-4aa1-a778-2a336bf2bc2f
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { notifyMarshalsRoundDayStart } from "@/lib/marshal/notifyMarshalsRoundDayStart";
import { listMarshalsForTournament } from "@/lib/marshal/resolveMarshal";

export const OFFICIAL_CALCUTA_TOURNAMENT_ID =
  "5d88f527-35e4-4aa1-a778-2a336bf2bc2f";
export const TEST_CALCUTA_TOURNAMENT_ID =
  "03b3dde9-fa40-4604-ac10-bb433e3086a2";

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

function parseArgs() {
  const tournamentArg = process.argv.find((a) => a.startsWith("--tournament="));
  const tournamentId = tournamentArg
    ? tournamentArg.split("=")[1]
    : OFFICIAL_CALCUTA_TOURNAMENT_ID;
  return { tournamentId };
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main() {
  if (!url || !key) {
    console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const { tournamentId } = parseArgs();
  const admin = createClient(url, key);

  const { data: tournament, error: tErr } = await admin
    .from("tournaments")
    .select("id, name")
    .eq("id", tournamentId)
    .maybeSingle();
  if (tErr || !tournament) {
    console.error("Torneo no encontrado:", tournamentId, tErr?.message);
    process.exit(1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: rounds, error: rErr } = await admin
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", tournamentId)
    .order("round_no", { ascending: true });
  if (rErr) {
    console.error("Error cargando rondas:", rErr.message);
    process.exit(1);
  }

  const round =
    rounds?.find((r) => r.round_date === today) ??
    rounds?.find((r) => r.round_date != null) ??
    null;
  if (!round) {
    console.error("No hay rondas para el torneo", tournament.name);
    process.exit(1);
  }

  const marshals = await listMarshalsForTournament(admin, tournamentId);
  console.log("Torneo:", tournament.name);
  console.log("Ronda:", round.round_no, round.round_date);
  console.log("Marshals con Telegram vinculado:", marshals);

  const result = await notifyMarshalsRoundDayStart(admin, {
    tournamentId,
    roundId: round.id,
    roundNo: round.round_no,
    roundDate: round.round_date ?? today,
    tournamentName: tournament.name,
  });

  console.log("Resultado:", result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
