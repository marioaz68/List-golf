/**
 * Restaura el cuadro de match play de un torneo a su forma original:
 * sembrado por subasta + draw estándar (1v32, 16v17, 8v25, …).
 * NO cierra ningún partido — los matches quedan `scheduled` o `bye`.
 *
 * Uso: npx tsx scripts/restore-auction-bracket.ts <tournament_id>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { autoPublishBracket } from "../lib/matchplay/autoPublishBracket";

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

const tournamentId =
  process.argv[2]?.trim() ?? "a3badced-0b7d-47cc-9f31-1d13545dc5f9";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const admin = createClient(url, key);

async function main() {
  // Quitar salidas auto-generadas en rondas > 1 (notas MATCH PLAY)
  const { data: laterRounds } = await admin
    .from("rounds")
    .select("id, round_no")
    .eq("tournament_id", tournamentId)
    .gt("round_no", 1);
  for (const r of laterRounds ?? []) {
    const { data: autoGroups } = await admin
      .from("pairing_groups")
      .select("id")
      .eq("round_id", r.id)
      .like("notes", "MATCH PLAY%");
    if (autoGroups?.length) {
      const ids = autoGroups.map((g) => g.id);
      await admin.from("pairing_group_members").delete().in("group_id", ids);
      await admin.from("pairing_groups").delete().in("id", ids);
      console.log(`Limpiado ${ids.length} grupo(s) auto-generado(s) en R${r.round_no}`);
    }
  }

  const result = await autoPublishBracket(admin, tournamentId);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

main();
