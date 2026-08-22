/**
 * Aviso correctivo: perdedores de R1–R3 NO juegan el sábado AM;
 * consolación stroke play el domingo.
 *
 * Uso: npx tsx scripts/send-consol-correction-telegram.ts
 */
import { createAdminClient } from "../utils/supabase/admin";
import { sendTelegramMessage } from "../lib/telegram/sendMessage";

const TOURNAMENT_ID = "5d88f527-35e4-4aa1-a778-2a336bf2bc2f";

const MESSAGE = [
  "⚠️ Corrección — Calcuta Parejas Varonil 2026",
  "",
  "Si recibiste un aviso de salida para el sábado 22 de agosto en la mañana (07:00), ignóralo: fue un error del sistema.",
  "",
  "Los perdedores de las rondas 1, 2 y 3 NO juegan match play el sábado.",
  "",
  "Todos los perdedores hasta ahora jugarán el domingo 23 de agosto en la consolación stroke play (salida 08:00, hoyo 10).",
  "",
  "El comité les confirmará horario y grupo antes del domingo.",
  "",
  "Disculpen la confusión.",
].join("\n");

async function main() {
  const admin = createAdminClient();

  const { data: mainBracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", TOURNAMENT_ID)
    .neq("name", "Consolación Match Play")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!mainBracket?.id) throw new Error("Sin cuadro principal");

  const { data: lostMatches } = await admin
    .from("matchplay_matches")
    .select(
      "round_no, winner_pair_id, top_pair_id, bottom_pair_id, status"
    )
    .eq("bracket_id", mainBracket.id)
    .in("round_no", [1, 2, 3])
    .eq("status", "completed");

  const loserPairIds = new Set<string>();
  for (const m of lostMatches ?? []) {
    if (!m.winner_pair_id || !m.top_pair_id || !m.bottom_pair_id) continue;
    const loser =
      m.winner_pair_id === m.top_pair_id
        ? m.bottom_pair_id
        : m.top_pair_id;
    if (loser) loserPairIds.add(String(loser));
  }

  if (loserPairIds.size === 0) {
    console.log("No hay perdedores R1–R3");
    return;
  }

  const { data: teams } = await admin
    .from("matchplay_pair_teams")
    .select("player_a_entry_id, player_b_entry_id")
    .in("id", [...loserPairIds]);

  const entryIds = new Set<string>();
  for (const t of teams ?? []) {
    if (t.player_a_entry_id) entryIds.add(String(t.player_a_entry_id));
    if (t.player_b_entry_id) entryIds.add(String(t.player_b_entry_id));
  }

  const { data: entries } = await admin
    .from("tournament_entries")
    .select(
      "players ( first_name, last_name, telegram_chat_id, telegram_user_id, telegram_chat_invalid_at )"
    )
    .in("id", [...entryIds]);

  type PlayerRow = {
    first_name: string | null;
    last_name: string | null;
    telegram_chat_id: string | null;
    telegram_user_id: string | null;
    telegram_chat_invalid_at: string | null;
  };

  const sent = new Set<string>();
  let ok = 0;
  let fail = 0;
  let skip = 0;

  for (const e of entries ?? []) {
    const raw = (e as { players: PlayerRow | PlayerRow[] | null }).players;
    const p = Array.isArray(raw) ? raw[0] : raw;
    if (!p || p.telegram_chat_invalid_at) {
      skip += 1;
      continue;
    }
    const chatId = String(p.telegram_chat_id ?? p.telegram_user_id ?? "").trim();
    if (!/^\d+$/.test(chatId) || sent.has(chatId)) {
      skip += 1;
      continue;
    }
    sent.add(chatId);

    const name = [p.first_name, p.last_name].filter(Boolean).join(" ");
    const res = await sendTelegramMessage({ chatId, text: MESSAGE });
    if (res.ok) {
      ok += 1;
      console.log("OK", name, chatId);
    } else {
      fail += 1;
      console.error("FAIL", name, chatId, res.error);
    }
  }

  console.log({ ok, fail, skip, unique: sent.size, loserPairs: loserPairIds.size });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
