import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAndTrackTelegramMessage } from "@/lib/telegram/outbox";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";

/**
 * Notifica por Telegram el inicio de una salida de la ronda del día a los
 * jugadores del grupo y a sus caddies asignados, con un botón que abre la
 * tarjeta de captura del grupo. Best-effort: los errores de envío no rompen
 * el flujo y las filas sin chat_id se ignoran.
 */
export type DailyNotifyResult = {
  sent: number;
  failed: number;
  skipped: number;
  skippedNames: Array<{ role: "player" | "caddie"; name: string }>;
};

function fullName(
  first: string | null | undefined,
  last: string | null | undefined
): string {
  return (
    [first, last]
      .map((p) => String(p ?? "").trim())
      .filter(Boolean)
      .join(" ") || "(sin nombre)"
  );
}

export async function notifyDailyRoundGroupStart(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    roundId: string;
    groupId: string;
  }
): Promise<DailyNotifyResult> {
  const result: DailyNotifyResult = {
    sent: 0,
    failed: 0,
    skipped: 0,
    skippedNames: [],
  };

  const groupId = String(args.groupId ?? "").trim();
  if (!groupId) return result;

  const [{ data: tournament }, { data: group }, { data: round }] =
    await Promise.all([
      admin
        .from("tournaments")
        .select("name")
        .eq("id", args.tournamentId)
        .maybeSingle(),
      admin
        .from("pairing_groups")
        .select("id, group_no, starting_hole, tee_time")
        .eq("id", groupId)
        .maybeSingle(),
      admin
        .from("rounds")
        .select("id, round_date")
        .eq("id", args.roundId)
        .maybeSingle(),
    ]);

  const groupNo =
    typeof group?.group_no === "number" ? group.group_no : null;
  const startingHole =
    typeof group?.starting_hole === "number" ? group.starting_hole : null;
  const teeTime = String(group?.tee_time ?? "").slice(0, 5) || null;
  const tournamentName =
    tournament?.name?.toString().trim() || "Ronda del día";

  // Jugadores del grupo con su chat de Telegram.
  const { data: membersRaw } = await admin
    .from("pairing_group_members")
    .select(
      `id, position, entry_id,
       tournament_entries (
         id,
         players ( first_name, last_name, telegram_user_id, telegram_chat_id )
       )`
    )
    .eq("group_id", groupId)
    .order("position", { ascending: true });

  type MemberRaw = {
    entry_id: string | null;
    tournament_entries:
      | {
          id: string | null;
          players:
            | {
                first_name: string | null;
                last_name: string | null;
                telegram_user_id?: string | null;
                telegram_chat_id?: string | null;
              }
            | null;
        }
      | null;
  };

  const players: Array<{ chatId: string; name: string; entryId: string }> = [];
  for (const m of (membersRaw ?? []) as unknown as MemberRaw[]) {
    const entry = Array.isArray(m.tournament_entries)
      ? m.tournament_entries[0]
      : m.tournament_entries;
    const player = entry?.players
      ? Array.isArray(entry.players)
        ? entry.players[0]
        : entry.players
      : null;
    if (!player || !entry?.id) continue;
    const chatId = String(
      player.telegram_chat_id ?? player.telegram_user_id ?? ""
    ).trim();
    const name = fullName(player.first_name, player.last_name);
    if (!chatId) {
      result.skipped += 1;
      result.skippedNames.push({ role: "player", name });
      continue;
    }
    players.push({ chatId, name, entryId: String(m.entry_id ?? entry.id) });
  }

  // Caddies asignados a estos jugadores — igual que en torneos: se cruzan por
  // entry_id (las asignaciones suelen guardarse sin pairing_group_id) y el ID
  // de Telegram del caddie vive en la columna `telegram` (numérico).
  const playerEntryIds = players.map((p) => p.entryId);
  const caddieRecipients: Array<{
    chatId: string;
    name: string;
    caddieId: string;
  }> = [];
  if (playerEntryIds.length > 0) {
    const { data: assignsRaw } = await admin
      .from("caddie_assignments")
      .select("caddie_id, entry_id, round_id, is_active")
      .eq("tournament_id", args.tournamentId)
      .in("entry_id", playerEntryIds);
    const caddieIds = Array.from(
      new Set(
        ((assignsRaw ?? []) as Array<{
          caddie_id: string | null;
          entry_id: string | null;
          round_id: string | null;
          is_active: boolean | null;
        }>)
          .filter(
            (a) =>
              a.is_active !== false &&
              a.caddie_id &&
              (a.round_id == null || a.round_id === args.roundId)
          )
          .map((a) => String(a.caddie_id))
      )
    );
    if (caddieIds.length > 0) {
      const { data: caddieRows } = await admin
        .from("caddies")
        .select("id, first_name, last_name, telegram")
        .in("id", caddieIds);
      for (const c of (caddieRows ?? []) as Array<{
        id: string;
        first_name: string | null;
        last_name: string | null;
        telegram?: string | null;
      }>) {
        const chatId = String(c.telegram ?? "").trim();
        const name = fullName(c.first_name, c.last_name);
        if (!/^\d+$/.test(chatId)) {
          result.skipped += 1;
          result.skippedNames.push({ role: "caddie", name });
          continue;
        }
        caddieRecipients.push({ chatId, name, caddieId: String(c.id) });
      }
    }
  }

  function buildText(greeting: string): string {
    const lines: string[] = [];
    lines.push(`${greeting},`);
    lines.push("");
    lines.push("⛳ ¡Tu ronda del día está por comenzar!");
    lines.push(`Club / ronda: ${tournamentName}`);
    if (round?.round_date) lines.push(`Fecha: ${round.round_date}`);
    if (groupNo != null) lines.push(`Salida: Grupo #${groupNo}`);
    if (teeTime) lines.push(`Hora: ${teeTime}`);
    if (startingHole != null) lines.push(`Hoyo de salida: ${startingHole}`);
    lines.push("");
    lines.push("Toca el botón para abrir tu tarjeta y registrar los scores:");
    return lines.join("\n");
  }

  const buttonLabel = `📝 Capturar Grupo ${groupNo ?? ""}`.trim();

  for (const p of players) {
    const url = buildGroupCaptureUrl({
      tournamentId: args.tournamentId,
      roundId: args.roundId,
      groupId,
      meEntryId: p.entryId,
    });
    const res = await sendAndTrackTelegramMessage(admin, {
      tournamentId: args.tournamentId,
      chatId: p.chatId,
      text: buildText(`Hola ${p.name}`),
      buttons: [[{ text: buttonLabel, url }]],
      disablePreview: true,
      kind: "next_round_group",
      roundId: args.roundId,
      groupId,
    });
    if (res.ok) result.sent += 1;
    else result.failed += 1;
  }

  for (const c of caddieRecipients) {
    const url = buildGroupCaptureUrl({
      tournamentId: args.tournamentId,
      roundId: args.roundId,
      groupId,
      caddieId: c.caddieId,
    });
    const res = await sendAndTrackTelegramMessage(admin, {
      tournamentId: args.tournamentId,
      chatId: c.chatId,
      text: buildText(`Hola ${c.name} (caddie)`),
      buttons: [[{ text: buttonLabel, url }]],
      disablePreview: true,
      kind: "next_round_group",
      roundId: args.roundId,
      groupId,
    });
    if (res.ok) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}
