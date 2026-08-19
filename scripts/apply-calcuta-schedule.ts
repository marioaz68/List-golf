/**
 * Aplica horarios Calcuta 64 a un torneo (rondas + reglas + tee times).
 * Uso: npx tsx scripts/apply-calcuta-schedule.ts [tournament_id]
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import {
  CALCUTA_SCHEDULE_RULES_TEXT,
  ensureMatchPlayCalendarRounds,
} from "@/lib/matchplay/ensureMatchPlayCalendarRounds";

const OFFICIAL_ID = "5d88f527-35e4-4aa1-a778-2a336bf2bc2f";
const TEST_ID = "03b3dde9-fa40-4604-ac10-bb433e3086a2";

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

async function main() {
  loadEnvLocal();
  const tid = process.argv[2]?.trim() || TEST_ID;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }

  const admin = createClient(url, key);
  const result = await ensureMatchPlayCalendarRounds(admin, tid);
  console.log("ensureMatchPlayCalendarRounds:", result);

  await admin
    .from("tournaments")
    .update({ end_date: "2026-08-23" })
    .eq("id", tid)
    .is("end_date", null);

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("config_json")
    .eq("tournament_id", tid)
    .maybeSingle();

  if (rulesRow) {
    const cfg = {
      ...((rulesRow.config_json as object) ?? {}),
      rules_text: CALCUTA_SCHEDULE_RULES_TEXT,
      reference_notes: CALCUTA_SCHEDULE_RULES_TEXT,
    };
    await admin
      .from("tournament_matchplay_rules")
      .update({ config_json: cfg, notes: CALCUTA_SCHEDULE_RULES_TEXT })
      .eq("tournament_id", tid);
  }

  const { data: conv } = await admin
    .from("tournament_convocatoria")
    .select("id, draft_json")
    .eq("tournament_id", tid)
    .maybeSingle();

  if (conv?.draft_json && typeof conv.draft_json === "object") {
    const draft = conv.draft_json as { matchplay?: Record<string, unknown> };
    if (draft.matchplay) {
      draft.matchplay.rules_text = CALCUTA_SCHEDULE_RULES_TEXT;
      draft.matchplay.reference_notes = CALCUTA_SCHEDULE_RULES_TEXT;
      await admin
        .from("tournament_convocatoria")
        .update({ draft_json: draft })
        .eq("id", conv.id);
    }
  }

  const { data: rows } = await admin
    .from("rounds")
    .select("round_no, round_date, start_time, interval_minutes, wave, notes")
    .eq("tournament_id", tid)
    .order("round_no");

  console.log("Rounds:", JSON.stringify(rows, null, 2));
  console.log("Done for", tid === TEST_ID ? "PRUEBA" : tid === OFFICIAL_ID ? "OFICIAL" : tid);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
