/** Detecta si faltan columnas telegram_user_id / telegram_chat_id en caddies. */
export function isMissingCaddieTelegramColumnsError(message: string | undefined): boolean {
  const m = String(message ?? "").toLowerCase();
  return (
    m.includes("telegram_user_id") ||
    m.includes("telegram_chat_id") ||
    (m.includes("column") && m.includes("caddies") && m.includes("telegram"))
  );
}
