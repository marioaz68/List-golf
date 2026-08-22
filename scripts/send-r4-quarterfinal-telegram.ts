/**
 * Reenvía la salida correcta de cuartos (R4 sábado) a los 16 jugadores vivos.
 * Usa reason=tee_adjusted para reemplazar avisos previos erróneos (R3 o consol).
 *
 * Uso: npx tsx scripts/send-r4-quarterfinal-telegram.ts
 */
import { createAdminClient } from "../utils/supabase/admin";
import { notifyNextRoundGroupCreated } from "../lib/matchplay/notifyNextRoundGroup";

const TOURNAMENT_ID = "5d88f527-35e4-4aa1-a778-2a336bf2bc2f";
const R4_ROUND_ID = "c30ea22e-dcf2-4fc9-baec-3ef60175592a";

async function main() {
  const admin = createAdminClient();

  const { data: groups, error } = await admin
    .from("pairing_groups")
    .select("id, group_no, tee_time, notes")
    .eq("round_id", R4_ROUND_ID)
    .like("notes", "MATCH PLAY%")
    .order("group_no", { ascending: true });

  if (error) throw new Error(error.message);
  if (!groups?.length) throw new Error("Sin salidas R4");

  console.log(`R4: ${groups.length} grupos`);

  let totalSent = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const g of groups) {
    console.log(`\nG${g.group_no} · ${g.tee_time?.slice(0, 5)} · ${g.notes}`);
    const res = await notifyNextRoundGroupCreated(admin, {
      tournamentId: TOURNAMENT_ID,
      nextRoundId: R4_ROUND_ID,
      nextGroupId: g.id,
      nextGroupNo: g.group_no,
      nextTeeTime: g.tee_time,
      reason: "tee_adjusted",
      closedMatchResult:
        "Cuartos de final — sábado 22 ago, salida en la mañana (horario abajo).",
    });
    totalSent += res.sent;
    totalFailed += res.failed;
    totalSkipped += res.skipped;
    for (const r of res.recipients) {
      const mark = r.ok ? "OK" : "FAIL";
      console.log(`  ${mark} ${r.role} ${r.name}${r.error ? ` · ${r.error}` : ""}`);
    }
    if (res.skippedNames.length) {
      console.log(
        `  skip sin Telegram: ${res.skippedNames.map((s) => s.name).join(", ")}`
      );
    }
  }

  console.log("\nResumen:", {
    groups: groups.length,
    sent: totalSent,
    failed: totalFailed,
    skipped: totalSkipped,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
