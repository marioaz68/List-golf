/**
 * Corrige consolación MP Calcuta: perdedores de cuartos (R4 principal),
 * no de octavos (R3). Borra cruces viejos y enruta #13 vs #24.
 *
 * Uso: npx tsx scripts/fix-consol-mp-r4-calcuta.ts
 */
import { createAdminClient } from "../utils/supabase/admin";
import {
  backfillConsolationLosersFromRound,
  CONSOLATION_BRACKET_NAME,
  maybeCreateConsolationRoundGroup,
  getMainBracketSize,
} from "../lib/matchplay/consolationMatchPlay";

const TOURNAMENT_ID = "5d88f527-35e4-4aa1-a778-2a336bf2bc2f";

async function main() {
  const admin = createAdminClient();

  // 1. from_round_no: 3 → 4 (cuartos, no octavos)
  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("config_json")
    .eq("tournament_id", TOURNAMENT_ID)
    .maybeSingle();

  const cfg = (rulesRow?.config_json ?? {}) as {
    consolations?: Array<Record<string, unknown>>;
  };
  const consolations = Array.isArray(cfg.consolations) ? cfg.consolations : [];
  const updated = consolations.map((c) =>
    c.consolation_format === "match_play" ? { ...c, from_round_no: 4 } : c
  );
  await admin
    .from("tournament_matchplay_rules")
    .update({ config_json: { ...cfg, consolations: updated } })
    .eq("tournament_id", TOURNAMENT_ID);

  console.log("✓ from_round_no → 4");

  // 2. Borrar partidos viejos de consolación (perdedores R3 en cuadro R4)
  const { data: consolBracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", TOURNAMENT_ID)
    .eq("name", CONSOLATION_BRACKET_NAME)
    .maybeSingle();

  if (consolBracket?.id) {
    const { data: old } = await admin
      .from("matchplay_matches")
      .select("id, round_no, position_no")
      .eq("bracket_id", consolBracket.id)
      .eq("round_no", 4);

    if (old?.length) {
      await admin
        .from("matchplay_matches")
        .delete()
        .in(
          "id",
          old.map((m) => m.id)
        );
      console.log(`✓ Eliminados ${old.length} partidos consol R4 (R3 perdedores)`);
    }
  }

  // 3. Enrutar perdedores de cuartos R4 ya cerrados
  const backfill = await backfillConsolationLosersFromRound(
    admin,
    TOURNAMENT_ID,
    4
  );
  console.log("✓ Backfill R4:", backfill);

  // 4. Crear salida para el match #13 vs #24 si ya tiene ambas parejas
  const { data: match } = await admin
    .from("matchplay_matches")
    .select("id, top_pair_id, bottom_pair_id")
    .eq("bracket_id", consolBracket?.id ?? "")
    .eq("round_no", 5)
    .eq("position_no", 1)
    .maybeSingle();

  if (match?.top_pair_id && match?.bottom_pair_id) {
    const mainSize = await getMainBracketSize(admin, TOURNAMENT_ID);
    const grp = await maybeCreateConsolationRoundGroup(admin, {
      tournamentId: TOURNAMENT_ID,
      nextMatchId: String(match.id),
      mainBracketSize: mainSize,
    });
    console.log("✓ Salida consol:", grp);
  } else {
    console.log("⚠ Match consol R5 M1 aún sin ambas parejas");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
