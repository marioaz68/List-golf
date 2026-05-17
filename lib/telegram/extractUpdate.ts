/** Extrae usuario, chat y texto de un update de Telegram Bot API. */
export function extractTelegramMessageUpdate(body: Record<string, unknown>) {
  const message =
    (body.message as Record<string, unknown> | undefined) ??
    (body.edited_message as Record<string, unknown> | undefined);

  if (!message) {
    return null;
  }

  const from = message.from as Record<string, unknown> | undefined;
  const chat = message.chat as Record<string, unknown> | undefined;

  let fromId = from?.id != null ? String(from.id) : "";
  const chatId = chat?.id != null ? String(chat.id) : "";
  const chatType = String(chat?.type ?? "");
  const text =
    String(message.text ?? "") ||
    String(message.caption ?? "");

  // Chat privado: chat.id === user id si falta from
  if (!fromId && chatId && !chatId.startsWith("-")) {
    fromId = chatId;
  }
  if (!fromId && chatType === "private" && chatId) {
    fromId = chatId;
  }

  return {
    fromId,
    chatId,
    chatType,
    text,
    firstName: from?.first_name != null ? String(from.first_name) : null,
    lastName: from?.last_name != null ? String(from.last_name) : null,
    username: from?.username != null ? String(from.username) : null,
  };
}
