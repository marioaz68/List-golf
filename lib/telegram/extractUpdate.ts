/** Extrae usuario, chat y texto de un update de Telegram Bot API.
 *  Ahora también extrae location (Live Location), message_id y flag de edición.
 */
export function extractTelegramMessageUpdate(body: Record<string, unknown>) {
  const isEdited = body.edited_message != null && body.message == null;
  const message =
    (body.message as Record<string, unknown> | undefined) ??
    (body.edited_message as Record<string, unknown> | undefined);

  if (!message) {
    return null;
  }

  const from = message.from as Record<string, unknown> | undefined;
  const chat = message.chat as Record<string, unknown> | undefined;
  const location = message.location as
    | {
        latitude?: number;
        longitude?: number;
        live_period?: number;
        horizontal_accuracy?: number;
      }
    | undefined;

  let fromId = from?.id != null ? String(from.id) : "";
  const chatId = chat?.id != null ? String(chat.id) : "";
  const chatType = String(chat?.type ?? "");
  const text =
    String(message.text ?? "") ||
    String(message.caption ?? "");
  const messageId =
    typeof message.message_id === "number" ? (message.message_id as number) : null;

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
    // Campos para ritmo de juego
    messageId,
    isEditedMessage: isEdited,
    location:
      location &&
      typeof location.latitude === "number" &&
      typeof location.longitude === "number"
        ? {
            lat: location.latitude,
            lon: location.longitude,
            livePeriod: location.live_period ?? null,
            accuracy:
              typeof location.horizontal_accuracy === "number"
                ? location.horizontal_accuracy
                : null,
          }
        : null,
  };
}
