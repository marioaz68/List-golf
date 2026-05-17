/** User id de Telegram: from.id o, en chat privado, chat.id. */
export function resolveTelegramUserId(params: {
  fromId: string;
  chatId: string;
  chatType: string;
}) {
  const from = params.fromId.trim();
  if (from) return from;

  const chat = params.chatId.trim();
  if (!chat) return "";

  // Grupos/canales: chat.id negativo; el user id debe venir en from.
  if (chat.startsWith("-")) return "";

  // Chat privado: chat.id === user id
  if (params.chatType === "private" || params.chatType === "") {
    return chat;
  }

  return chat;
}
