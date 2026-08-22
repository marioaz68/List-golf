import type { SupabaseClient } from "@supabase/supabase-js";
import { sendAndTrackTelegramMessage } from "@/lib/telegram/outbox";
import { buildGroupCaptureUrl } from "@/lib/score-entry/groupCaptureUrl";
import { refreshLiveGroupSalida } from "@/lib/telegram/refreshLiveGroupSalida";

/**
 * Tras crear el `pairing_group` de la siguiente ronda de un cuadro de
 * match play, envía un mensaje de Telegram a los 4 jugadores y a sus
 * caddies con:
 *   - resultado del match recién cerrado,
 *   - próxima salida (ronda, grupo, tee time),
 *   - botón que abre /captura/tarjeta del nuevo grupo.
 *
 * Antes de cada envío relee salidas en vivo: si el comité ya movió el
 * tee, manda el horario actual (y avisa ajuste si el caller traía otro).
 *
 * Es best-effort: errores de envío no rompen el cierre del match. Las
 * filas sin telegram_chat_id se ignoran silenciosamente.
 */
export type NotifyRecipient = {
  /** "player" | "caddie" */
  role: "player" | "caddie";
  name: string;
  /** Si se envió correctamente. */
  ok: boolean;
  /** Error de Telegram si ok=false (no se muestra al usuario si está vacío). */
  error?: string;
  /** Cuántos mensajes anteriores se borraron en su chat (de rondas previas). */
  replacedPrevious: number;
};

export type NotifyResult = {
  sent: number;
  failed: number;
  /** Destinatarios sin chat_id de Telegram (no se intentó enviar). */
  skipped: number;
  /** Nombres de quienes no tenían chat_id (player/caddie). */
  skippedNames: Array<{ role: "player" | "caddie"; name: string }>;
  /** Lista detallada de envíos efectuados (éxitos y fallos). */
  recipients: NotifyRecipient[];
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
    /**
     * `created` = avance de cuadro (default).
     * `tee_adjusted` = el comité cambió el tee; avisa y reemplaza el mensaje previo.
     */
    reason?: "created" | "tee_adjusted";
    /** Tee anterior (HH:MM), solo para mensaje de ajuste. */
    previousTeeTime?: string | null;
  }
): Promise<NotifyResult> {
  const result: NotifyResult = {
    sent: 0,
    failed: 0,
    skipped: 0,
    skippedNames: [],
    recipients: [],
  };

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

  // 2. Datos del grupo + torneo — siempre relectura en vivo de salidas
  //    (no confiar en nextTeeTime/groupNo del caller si el comité ya movió).
  const refreshed = await refreshLiveGroupSalida(admin, {
    groupId,
    roundId: args.nextRoundId,
    proposedTeeTime: args.nextTeeTime ?? args.previousTeeTime ?? null,
  });
  if (!refreshed) return result;

  const live = refreshed.live;
  const roundId = live.roundId || String(args.nextRoundId).trim();

  const { data: tournament } = await admin
    .from("tournaments")
    .select("name, short_name")
    .eq("id", args.tournamentId)
    .maybeSingle();

  let reason = args.reason ?? "created";
  let prevTee =
    String(args.previousTeeTime ?? "").trim().slice(0, 5) || null;

  // Si el caller traía un tee distinto al de salidas → usar el vivo y
  // avisar ajuste (salvo que ya veníamos en modo tee_adjusted).
  if (refreshed.teeWasStale) {
    if (!prevTee) prevTee = refreshed.proposedTeeTime;
    if (reason === "created") reason = "tee_adjusted";
  }

  const groupNo = live.groupNo ?? args.nextGroupNo ?? null;
  const startingHole = live.startingHole;
  const teeTime = live.teeTime;
  const roundNo = live.roundNo;
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
         players ( first_name, last_name, telegram_user_id, telegram_chat_id, telegram_chat_invalid_at )
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
                telegram_chat_invalid_at?: string | null;
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
    const name = fullName(player.first_name, player.last_name);
    if (player.telegram_chat_invalid_at) {
      result.skipped += 1;
      result.skippedNames.push({ role: "player", name });
      continue;
    }
    const chatId = String(
      player.telegram_chat_id ?? player.telegram_user_id ?? ""
    ).trim();
    if (!chatId) {
      result.skipped += 1;
      result.skippedNames.push({ role: "player", name });
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
      .eq("round_id", roundId)
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
        .select(
          "id, first_name, last_name, telegram, telegram_user_id, telegram_chat_id, telegram_chat_invalid_at"
        )
        .in("id", caddieIds);
      if (!tryWithTg.error && tryWithTg.data) {
        for (const c of tryWithTg.data as Array<{
          id: string;
          first_name: string | null;
          last_name: string | null;
          telegram?: string | null;
          telegram_user_id?: string | null;
          telegram_chat_id?: string | null;
          telegram_chat_invalid_at?: string | null;
        }>) {
          const name = fullName(c.first_name, c.last_name);
          if (c.telegram_chat_invalid_at) {
            result.skipped += 1;
            result.skippedNames.push({ role: "caddie", name });
            continue;
          }
          const chatId = String(
            c.telegram_chat_id ?? c.telegram_user_id ?? c.telegram ?? ""
          ).trim();
          if (!chatId) {
            result.skipped += 1;
            result.skippedNames.push({ role: "caddie", name });
            continue;
          }
          caddieRecipients.push({
            chatId,
            name,
            caddieId: String(c.id),
          });
        }
      }
    }
  }

  // 5. Mensaje + envío (segunda relectura por si movieron el tee mientras
  //    armábamos destinatarios).
  const refreshedAgain = await refreshLiveGroupSalida(admin, {
    groupId,
    roundId,
    proposedTeeTime: teeTime,
  });
  const finalLive = refreshedAgain?.live ?? live;
  if (refreshedAgain?.teeWasStale) {
    if (!prevTee) prevTee = refreshedAgain.proposedTeeTime;
    reason = "tee_adjusted";
  }

  const finalGroupNo = finalLive.groupNo ?? groupNo;
  const finalStartingHole = finalLive.startingHole ?? startingHole;
  const curTee = finalLive.teeTime;
  const finalRoundNo = finalLive.roundNo ?? roundNo;
  const finalRoundId = finalLive.roundId || roundId;

  function buildText(greeting: string): string {
    const lines: string[] = [];
    lines.push(`${greeting},`);
    lines.push("");
    if (reason === "tee_adjusted") {
      lines.push("⚠️ Ajuste de horario de salida");
      lines.push(
        "Hubo un cambio en las salidas. Este mensaje reemplaza el anterior: la hora de abajo es la correcta."
      );
      if (prevTee && curTee && prevTee !== curTee) {
        lines.push(`Antes: ${prevTee} → Ahora: ${curTee}`);
      }
    } else {
      lines.push("🏌️ ¡Avanzaste a la siguiente ronda del cuadro!");
      if (args.closedMatchResult) {
        lines.push(`Match cerrado: ${args.closedMatchResult}`);
      }
    }
    if (tournamentName) lines.push(`Torneo: ${tournamentName}`);
    if (finalRoundNo != null) {
      lines.push(
        reason === "tee_adjusted"
          ? `Ronda: R${finalRoundNo}`
          : `Próxima ronda: R${finalRoundNo}`
      );
    }
    if (finalGroupNo != null) lines.push(`Grupo: #${finalGroupNo}`);
    if (finalStartingHole != null) {
      lines.push(`Hoyo de salida: ${finalStartingHole}`);
    }
    if (curTee) lines.push(`Tee time: ${curTee}`);
    lines.push("");
    lines.push(
      reason === "tee_adjusted"
        ? "Toca el botón para abrir la tarjeta actualizada:"
        : "Toca el botón para abrir la tarjeta de la próxima ronda:"
    );
    return lines.join("\n");
  }

  const buttonLabel = `📝 Capturar Grupo ${finalGroupNo ?? ""}`.trim();

  for (const p of players) {
    const url = buildGroupCaptureUrl({
      tournamentId: args.tournamentId,
      roundId: finalRoundId,
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
      roundId: finalRoundId,
      groupId,
    });
    if (res.ok) {
      result.sent += 1;
      result.recipients.push({
        role: "player",
        name: p.name,
        ok: true,
        replacedPrevious: res.deletedMessageIds.length,
      });
    } else {
      result.failed += 1;
      result.recipients.push({
        role: "player",
        name: p.name,
        ok: false,
        error: res.error,
        replacedPrevious: res.deletedMessageIds.length,
      });
    }
  }

  for (const c of caddieRecipients) {
    const url = buildGroupCaptureUrl({
      tournamentId: args.tournamentId,
      roundId: finalRoundId,
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
      roundId: finalRoundId,
      groupId,
    });
    if (res.ok) {
      result.sent += 1;
      result.recipients.push({
        role: "caddie",
        name: c.name,
        ok: true,
        replacedPrevious: res.deletedMessageIds.length,
      });
    } else {
      result.failed += 1;
      result.recipients.push({
        role: "caddie",
        name: c.name,
        ok: false,
        error: res.error,
        replacedPrevious: res.deletedMessageIds.length,
      });
    }
  }

  return result;
}
