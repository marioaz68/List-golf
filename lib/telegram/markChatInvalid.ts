import type { SupabaseClient } from "@supabase/supabase-js";
import type { TelegramSendErrorKind } from "@/lib/telegram/sendMessage";

export type MarkChatInvalidReason = TelegramSendErrorKind | string;

/**
 * Marca chat_id como inválido en players y/o caddies que usen ese chat.
 * No borra telegram_user_id: el deep link puede reparar sobrescribiendo chat_id.
 */
export async function markTelegramChatInvalid(
  admin: SupabaseClient,
  params: {
    chatId: string;
    reason: MarkChatInvalidReason;
    detail?: string | null;
  }
): Promise<{ players: number; caddies: number }> {
  const chatId = String(params.chatId ?? "").trim();
  if (!/^\d+$/.test(chatId)) return { players: 0, caddies: 0 };

  const reasonCode = String(params.reason ?? "other").trim() || "other";
  const detail = String(params.detail ?? "").trim();
  const reasonText = detail
    ? `${reasonCode}: ${detail}`.slice(0, 500)
    : reasonCode;

  const patch = {
    telegram_chat_invalid_at: new Date().toISOString(),
    telegram_chat_invalid_reason: reasonText,
  };

  let players = 0;
  let caddies = 0;

  const { data: playerRows } = await admin
    .from("players")
    .update(patch)
    .or(`telegram_chat_id.eq.${chatId},telegram_user_id.eq.${chatId}`)
    .select("id");
  players = playerRows?.length ?? 0;

  // Caddies: chat_id, user_id y legacy `telegram`.
  const { data: caddieRows } = await admin
    .from("caddies")
    .update(patch)
    .or(
      `telegram_chat_id.eq.${chatId},telegram_user_id.eq.${chatId},telegram.eq.${chatId}`
    )
    .select("id");
  caddies = caddieRows?.length ?? 0;

  return { players, caddies };
}

export function isFatalTelegramChatError(
  kind: TelegramSendErrorKind | null | undefined
): boolean {
  return kind === "chat_not_found" || kind === "bot_blocked";
}
