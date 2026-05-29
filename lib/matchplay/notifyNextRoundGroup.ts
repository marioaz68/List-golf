import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";

/**
 * Tras crear el `pairing_group` de la siguiente ronda de un cuadro de
 * match play, envía un mensaje de Telegram a los 4 jugadores y a sus
 * caddies con:
 *   - resultado del match recién cerrado,
 *   - próxima salida (ronda, grupo, tee time),
 *   - botón que abre /captura/tarjeta del nuevo grupo.
 *
 * Es best-effort: errores de envío no rompen el cierre del match. Las
 * filas sin telegram_chat_id se ignoran silenciosamente.
 */
export type NotifyResult = {
  sent: number;
  failed: number;
  skipped: number;
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

export async function notifyNextRoundGroupCreated(
  admin: SupabaseClient,
  args: {
    tournamentId: string;
    nextRoundId: string;
    nextGroupId?: string | null;
    nextGroupNo?: number | null;
    nextTeeTime?: string | null;
    /** Texto del resultado del match que se acaba de cerrar (para anunciar). */
    closedMatchResult?: string | null;
  }
): Promise<NotifyResult> {
  const result: NotifyResult = { sent: 0, failed: 0, skipped: 0 };

  // 1. Identificar el grupo destino: o se pasó explícito o se busca por
  //    group_no en la ronda.
  let groupId = String(args.nextGroupId ?? "").trim();
  if (!groupId && args.nextGroupNo != null) {
    const { data: g } = await admin
      .from("pairing_groups")
      .select("id")
      .eq("round_id", args.nextRoundId)
      .eq("group_no", args.nextGroupNo)
      .maybeSingle();
    groupId = String(g?.id ?? "").trim();
  }
  if (!groupId) return result;

  // 2. Datos del grupo + torneo
  const [{ data: tournament }, { data: group }, { data: round }] =
    await Promise.all([
      admin
        .from("tournaments")
        .select("name, short_name")
        .eq("id", args.tournamentId)
        .maybeSingle(),
      admin
        .from("pairing_groups")
        .select("id, group_no, starting_hole, tee_time")
        .eq("id", groupId)
        .maybeSingle(),
      admin
        .from("rounds")
        .select("id, round_no, round_date")
        .eq("id", args.nextRoundId)
        .maybeSingle(),
    ]);

  const groupNo =
    typeof group?.group_no === "number"
      ? group.group_no
      : args.nextGroupNo ?? null;
  const startingHole =
    typeof group?.starting_hole === "number" ? group.starting_hole : null;
  const teeTime =
    String(group?.tee_time ?? args.nextTeeTime ?? "").trim() || null;
  const roundNo = typeof round?.round_no === "number" ? round.round_no : null;
  const tournamentName =
    tournament?.short_name?.toString().trim() ||
    tournament?.name?.toString().trim() ||
    null;

  // 3. Jugadores del grupo (con sus chat_id)
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
    position: number | null;
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

  type PlayerRecipient = {
    chatId: string;
    name: string;
    entryId: string;
  };
  const players: PlayerRecipient[] = [];

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
      continue;
    }
    players.push({
      chatId,
      name,
      entryId: String(m.entry_id ?? entry.id),
    });
  }

  // 4. Caddies asignados al nuevo grupo o al jugador en esa ronda
  const playerEntryIds = players.map((p) => p.entryId);
  const caddieRecipients: Array<{
    chatId: string;
    name: string;
    caddieId: string;
  }> = [];

  if (playerEntryIds.length > 0) {
    const { data: assignsRaw } = await admin
      .from("caddie_assignments")
      .select("caddie_id, entry_id, pairing_group_id, round_id, is_active")
      .eq("tournament_id", args.tournamentId)
      .eq("round_id", args.nextRoundId)
      .in("entry_id", playerEntryIds);

    const caddieIds = Array.from(
      new Set(
        (assignsRaw ?? [])
          .filter((a) => a.is_active !== false && a.caddie_id)
          .map((a) => String(a.caddie_id))
      )
    );
    if (caddieIds.length > 0) {
      const tryWithTg = await admin
        .from("caddies")
        .select("id, first_name, last_name, telegram_user_id, telegram_chat_id")
        .in("id", caddieIds);
      if (!tryWithTg.error && tryWithTg.data) {
        for (const c of tryWithTg.data as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          telegram_user_id?: string | null;
          telegram_chat_id?: string | null;
        }>) {
          const chatId = String(
            c.telegram_chat_id ?? c.telegram_user_id ?? ""
          ).trim();
          if (!chatId) {
            result.skipped += 1;
            continue;
          }
          caddieRecipients.push({
            chatId,
            name: fullName(c.first_name, c.last_name),
            caddieId: String(c.id),
          });
        }
      }
    }
  }

  // 5. Mensaje + envío
  function buildText(greeting: string): string {
    const lines: string[] = [];
    lines.push(`${greeting},`);
    lines.push("");
    lines.push("🏌️ ¡Avanzaste a la siguiente ronda del cuadro!");
    if (args.closedMatchResult) {
      lines.push(`Match cerrado: ${args.closedMatchResult}`);
    }
    if (tournamentName) lines.push(`Torneo: ${tournamentName}`);
    if (roundNo != null) lines.push(`Próxima ronda: R${roundNo}`);
    if (groupNo != null) lines.push(`Grupo: #${groupNo}`);
    if (startingHole != null) lines.push(`Hoyo de salida: ${startingHole}`);
    if (teeTime) lines.push(`Tee time: ${teeTime}`);
    lines.push("");
    lines.push("Toca el botón para abrir la tarjeta de la próxima ronda:");
    return lines.join("\n");
  }

  const buttonLabel = `📝 Capturar Grupo ${groupNo ?? ""}`.trim();

  for (const p of players) {
    const url = buildGroupCaptureUrl({
      tournamentId: args.tournamentId,
      roundId: args.nextRoundId,
      groupId,
      meEntryId: p.entryId,
    });
    const res = await sendTelegramMessage({
      chatId: p.chatId,
      text: buildText(`Hola ${p.name}`),
      buttons: [[{ text: buttonLabel, url }]],
      disablePreview: true,
    });
    if (res.ok) result.sent += 1;
    else result.failed += 1;
  }

  for (const c of caddieRecipients) {
    const url = buildGroupCaptureUrl({
      tournamentId: args.tournamentId,
      roundId: args.nextRoundId,
      groupId,
      caddieId: c.caddieId,
    });
    const res = await sendTelegramMessage({
      chatId: c.chatId,
      text: buildText(`Hola ${c.name} (caddie)`),
      buttons: [[{ text: buttonLabel, url }]],
      disablePreview: true,
    });
    if (res.ok) result.sent += 1;
    else result.failed += 1;
  }

  return result;
}
