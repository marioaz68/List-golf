import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteTelegramMessage,
  sendTelegramMessage,
  type TelegramInlineButton,
} from "@/lib/telegram/sendMessage";

export type OutboxKind =
  | "next_round_group"
  | "tee_kit_invite"
  | "ritmo_share_invite"
  | "ritmo_share_late"
  | "ritmo_committee_late"
  | "generic";

export type SendAndTrackOptions = {
  tournamentId: string;
  chatId: string;
  text: string;
  buttons?: TelegramInlineButton[][];
  disablePreview?: boolean;
  /** Kind del mensaje — solo se borran los anteriores con el mismo kind. */
  kind?: OutboxKind;
  roundId?: string | null;
  groupId?: string | null;
};

export type SendAndTrackResult =
  | {
      ok: true;
      messageId: number | null;
      /** message_id de los mensajes que se borraron antes de enviar. */
      deletedMessageIds: number[];
    }
  | {
      ok: false;
      error: string;
      deletedMessageIds: number[];
    };

/**
 * Envía un mensaje de Telegram y deja registro en `telegram_outbox`.
 * Antes de enviar, busca cualquier mensaje previo para el mismo torneo+chat
 * con el mismo `kind` y lo borra del chat + de la bitácora (best-effort).
 *
 * Esto evita que el bot acumule varios mensajes "estás en la R2", "estás
 * en la R3"… para el mismo jugador conforme avanza el torneo.
 */
export async function sendAndTrackTelegramMessage(
  admin: SupabaseClient,
  params: SendAndTrackOptions
): Promise<SendAndTrackResult> {
  const tournamentId = String(params.tournamentId ?? "").trim();
  const chatId = String(params.chatId ?? "").trim();
  const kind: OutboxKind = params.kind ?? "next_round_group";
  const deletedMessageIds: number[] = [];

  if (!tournamentId || !chatId) {
    return {
      ok: false,
      error: "Faltan tournament_id o chat_id.",
      deletedMessageIds,
    };
  }

  // 1) Buscar y borrar mensajes previos del mismo kind para este chat.
  try {
    const { data: prevRows } = await admin
      .from("telegram_outbox")
      .select("id, message_id")
      .eq("tournament_id", tournamentId)
      .eq("chat_id", chatId)
      .eq("kind", kind);

    const idsToDelete: string[] = [];
    for (const row of (prevRows ?? []) as Array<{
      id: string;
      message_id: number | string | null;
    }>) {
      const mid = Number(row.message_id);
      if (Number.isFinite(mid) && mid > 0) {
        const del = await deleteTelegramMessage(chatId, mid);
        if (del.ok) deletedMessageIds.push(mid);
        // No bloqueamos: si Telegram ya no permite borrar (>48h), seguimos.
      }
      idsToDelete.push(row.id);
    }
    if (idsToDelete.length > 0) {
      await admin.from("telegram_outbox").delete().in("id", idsToDelete);
    }
  } catch {
    /* lectura/borrado del outbox best-effort */
  }

  // 2) Enviar el mensaje nuevo.
  const sent = await sendTelegramMessage({
    chatId,
    text: params.text,
    buttons: params.buttons,
    disablePreview: params.disablePreview,
  });
  if (!sent.ok) {
    return { ok: false, error: sent.error, deletedMessageIds };
  }

  // 3) Registrar el nuevo mensaje.
  if (sent.messageId != null) {
    try {
      await admin.from("telegram_outbox").insert({
        tournament_id: tournamentId,
        chat_id: chatId,
        message_id: sent.messageId,
        round_id: params.roundId ?? null,
        group_id: params.groupId ?? null,
        kind,
      });
    } catch {
      /* el registro es best-effort; el mensaje ya quedó enviado */
    }
  }

  return { ok: true, messageId: sent.messageId, deletedMessageIds };
}
