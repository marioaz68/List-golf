/**
 * Diagnóstico bolitas R1/R2/R3 en inscripciones para un # de jugador.
 * Uso: npx tsx scripts/diagnose-player-round-balls.ts <tournament_id> <player_number>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";
import { getRoundForCategory } from "../lib/rounds/categoryRoundGate";

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

const tournamentIdArg = process.argv[2]?.trim();
const playerNumber = Number(process.argv[3]);
if (!Number.isFinite(playerNumber)) {
  console.error(
    "Uso: npx tsx scripts/diagnose-player-round-balls.ts <tournament_id> <player_number>"
  );
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

function holeNo(row: { hole_number?: number | null; hole_no?: number | null }) {
  const raw = row.hole_number ?? row.hole_no;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

async function main() {
  const admin = createClient(url!, key!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let tournamentId = tournamentIdArg;
  if (!tournamentId) {
    const { data: hits } = await admin
      .from("tournament_entries")
      .select("tournament_id, tournaments(name, status)")
      .eq("player_number", playerNumber)
      .order("created_at", { ascending: false })
      .limit(5);
    console.log("Torneos con #" + playerNumber + ":", hits);
    tournamentId = hits?.[0]?.tournament_id;
    if (!tournamentId) {
      console.error("No se encontró inscripción.");
      process.exit(1);
    }
    console.log("Usando torneo:", tournamentId, hits?.[0]?.tournaments);
  }

  const { data: entry, error: eErr } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, player_number, category_id, category:categories(code, name), player:players(first_name, last_name)"
    )
    .eq("tournament_id", tournamentId)
    .eq("player_number", playerNumber)
    .maybeSingle();

  if (eErr || !entry) {
    console.error("Inscripción no encontrada:", eErr?.message ?? "");
    process.exit(1);
  }

  const { data: rounds } = await admin
    .from("rounds")
    .select("id, round_no, category_id, category:categories(code)")
    .eq("tournament_id", tournamentId)
    .order("round_no");

  const { data: scorecards } = await admin
    .from("scorecards")
    .select("id, round_id, locked_at, status, created_at")
    .eq("entry_id", entry.id);

  const playerId = String(entry.player_id);
  const catId = String(entry.category_id ?? "");

  console.log("\n=== Jugador ===");
  const p = Array.isArray(entry.player) ? entry.player[0] : entry.player;
  const c = Array.isArray(entry.category) ? entry.category[0] : entry.category;
  console.log(
    `#${entry.player_number} ${p?.first_name ?? ""} ${p?.last_name ?? ""} | cat ${c?.code} ${c?.name} | entry ${entry.id}`
  );

  for (const roundNo of [1, 2, 3]) {
    const round = getRoundForCategory(
      (rounds ?? []).map((r) => ({
        id: r.id,
        round_no: Number(r.round_no),
        category_id: r.category_id,
      })),
      roundNo,
      catId || null
    );

    console.log(`\n--- R${roundNo} (UI usa round_id ${round?.id ?? "N/A"}) ---`);

    if (!round) {
      console.log("Sin fila rounds para esta categoría.");
      continue;
    }

    const roundMeta = (rounds ?? []).find((r) => r.id === round.id);
    const roundCat = Array.isArray(roundMeta?.category)
      ? roundMeta?.category[0]
      : roundMeta?.category;
    console.log(`Ronda cat: ${roundCat?.code ?? "?"}`);

    const allRoundsSameNo = (rounds ?? []).filter(
      (r) => Number(r.round_no) === roundNo
    );
    console.log(
      `Filas round_no=${roundNo} en torneo:`,
      allRoundsSameNo
        .map((r) => {
          const rc = Array.isArray(r.category) ? r.category[0] : r.category;
          return `${rc?.code ?? "?"}:${r.id.slice(0, 8)}`;
        })
        .join(", ")
    );

    const scOnCorrect = (scorecards ?? []).find(
      (sc) => String(sc.round_id) === String(round.id)
    );
    const scAnySameNo = (scorecards ?? []).filter((sc) => {
      const rm = (rounds ?? []).find((r) => r.id === sc.round_id);
      return rm && Number(rm.round_no) === roundNo;
    });

    console.log("Scorecard en round correcto:", scOnCorrect ?? "ninguna");
    if (scAnySameNo.length > 1 || (scAnySameNo[0] && !scOnCorrect)) {
      console.log(
        "Otras scorecards mismo round_no:",
        scAnySameNo.map((sc) => ({
          round_id: sc.round_id,
          locked_at: sc.locked_at,
        }))
      );
    }

    const { data: rsRows } = await admin
      .from("round_scores")
      .select("id, round_id, gross_score")
      .eq("player_id", playerId)
      .in(
        "round_id",
        allRoundsSameNo.map((r) => r.id)
      );

    for (const rs of rsRows ?? []) {
      const rm = (rounds ?? []).find((r) => r.id === rs.round_id);
      const rc = Array.isArray(rm?.category) ? rm?.category[0] : rm?.category;
      const { data: holes } = await admin
        .from("hole_scores")
        .select("hole_number, hole_no, strokes")
        .eq("round_score_id", rs.id);

      const distinct = new Set<number>();
      for (const h of holes ?? []) {
        const n = holeNo(h);
        if (n != null) distinct.add(n);
      }

      console.log(
        `round_scores ${rc?.code ?? "?"} round_id=${String(rs.round_id).slice(0, 8)}… | gross=${rs.gross_score} | hoyos=${distinct.size}`
      );
    }

    if (!rsRows?.length) {
      console.log("Sin round_scores en ninguna fila de este round_no.");
    }
  }

  console.log("\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
