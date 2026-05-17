/** Normaliza texto de comando (HOLA, /start@BotName → /START). */
export function parseTelegramCommand(text: unknown) {
  const raw = String(text ?? "").trim();
  if (!raw) return "";

  const upper = raw.toUpperCase();
  const base = upper.split(/\s+/)[0] ?? upper;
  const withoutBotSuffix = base.includes("@") ? base.split("@")[0]! : base;
  return withoutBotSuffix;
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
