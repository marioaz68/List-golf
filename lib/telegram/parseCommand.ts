/** Normaliza texto de comando (HOLA, /start@BotName → /START). */
export function parseTelegramCommand(text: unknown) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  const base = upper.split(/\s+/)[0] ?? upper;
  const withoutBotSuffix = base.includes("@") ? base.split("@")[0]! : base;
  return withoutBotSuffix;
}

/**
 * Payload de /start TOKEN (deep link). Null si no es /start o viene sin token.
 * Telegram limita el payload a 64 caracteres.
 */
export function parseTelegramStartPayload(text: unknown): string | null {
  const raw = String(text ?? "").trim();
  const m = raw.match(/^\/start(?:@\w+)?(?:\s+(.+))?$/i);
  if (!m) return null;
  const payload = String(m[1] ?? "").trim();
  return payload || null;
}

export function isTelegramIdRequest(command: string) {
  const c = command.trim();
  return (
    c === "ID" ||
    c === "/ID" ||
    c === "MIID" ||
    c === "MI ID" ||
    c === "/START" ||
    c === "START"
  );
}
