import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createAdminClient } from "../utils/supabase/admin";
import { recomputeTournamentHandicaps } from "../lib/handicap/recomputeTournamentHandicaps";

const envPath = resolve(process.cwd(), ".env.local");
for (const line of readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  const key = m[1];
  let val = m[2].trim();
  if (
    (val.startsWith('"') && val.endsWith('"')) ||
    (val.startsWith("'") && val.endsWith("'"))
  ) {
    val = val.slice(1, -1);
  }
  if (!process.env[key]) process.env[key] = val;
}

const tournamentId =
  process.argv[2] ?? "a3badced-0b7d-47cc-9f31-1d13545dc5f9";
const entryIds = process.argv.slice(3).filter(Boolean);

async function main() {
  const admin = createAdminClient();
  const result = await recomputeTournamentHandicaps(
    admin,
    tournamentId,
    entryIds.length > 0 ? { entryIds } : undefined
  );
  console.log("RECOMPUTE_RESULT", JSON.stringify(result));

  const checkQuery = admin
    .from("tournament_entries")
    .select(
      "id, handicap_index, course_handicap, playing_handicap, tee_set_id_override, handicap_calc_meta, players(first_name, last_name)"
    )
    .eq("tournament_id", tournamentId);

  const { data } =
    entryIds.length > 0
      ? await checkQuery.in("id", entryIds)
      : await checkQuery.in("player_id", [
          "8e33e9e3-b7aa-4e14-adfa-d3e7ca9d2486",
          "57d31d56-68a8-4367-9d8f-992b7e40a3fe",
        ]);

  for (const row of data ?? []) {
    const p = Array.isArray(row.players) ? row.players[0] : row.players;
    const meta = row.handicap_calc_meta as { hi?: number } | null;
    console.log(
      "CHECK",
      p?.first_name,
      p?.last_name,
      "HI",
      row.handicap_index,
      "CH",
      row.course_handicap,
      "PH",
      row.playing_handicap,
      "meta_hi",
      meta?.hi
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
