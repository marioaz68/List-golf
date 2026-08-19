/** Repara group_no y tee_time consecutivos en una ronda. */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { compactAndSyncRoundGroups } from "@/lib/matchplay/pairingGroupOrder";

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

const roundId = process.argv[2] ?? "78f13c6f-14db-482c-8973-8983ba988f3a";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const admin = createClient(url, key);
  await compactAndSyncRoundGroups(admin, roundId);

  const { data } = await admin
    .from("pairing_groups")
    .select("group_no, tee_time, notes")
    .eq("round_id", roundId)
    .order("group_no");
  console.log(JSON.stringify(data, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
