const TELEGRAM_API = "https://api.telegram.org/bot";

export function getTelegramBotUsername() {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() ?? ""
  );
}

export function getTelegramBotUrl() {
  const user = getTelegramBotUsername();
  return user ? `https://t.me/${user}` : null;
}

export type TelegramInlineButton = {
  text: string;
  url: string;
};

export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
  /** Botones tappables (inline_keyboard). Cada array interior es una fila. */
  buttons?: TelegramInlineButton[][];
  /** Si true, se desactiva el preview del link (deja la tarjeta sin imagen grande). */
  disablePreview?: boolean;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false as const, error: "Falta TELEGRAM_BOT_TOKEN en el servidor." };
  }

  const chatId = params.chatId.trim();
  if (!chatId) {
    return { ok: false as const, error: "Falta chat ID de Telegram." };
  }

  const body: Record<string, unknown> = {
    chat_id: chatId,
    text: params.text,
  };

  if (params.disablePreview) {
    body.disable_web_page_preview = true;
  }

  if (params.buttons && params.buttons.length > 0) {
    body.reply_markup = {
      inline_keyboard: params.buttons.map((row) =>
        row.map((b) => ({ text: b.text, url: b.url }))
      ),
    };
  }

  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const response = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;

  if (!res.ok || response?.ok === false) {
    return {
      ok: false as const,
      error: response?.description ?? `Telegram API HTTP ${res.status}`,
    };
  }

  return { ok: true as const };
}

export async function getTelegramWebhookInfo() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false as const, error: "Falta TELEGRAM_BOT_TOKEN." };
  }

  const res = await fetch(`${TELEGRAM_API}${token}/getWebhookInfo`);
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: Record<string, unknown>;
    description?: string;
  } | null;

  if (!res.ok || body?.ok === false) {
    return {
      ok: false as const,
      error: body?.description ?? `HTTP ${res.status}`,
    };
  }

  return { ok: true as const, result: body?.result ?? {} };
}

export async function setTelegramWebhook(webhookUrl: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false as const, error: "Falta TELEGRAM_BOT_TOKEN." };
  }

  const res = await fetch(`${TELEGRAM_API}${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: webhookUrl,
      allowed_updates: ["message", "edited_message"],
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;

  if (!res.ok || body?.ok === false) {
    return {
      ok: false as const,
      error: body?.description ?? `HTTP ${res.status}`,
    };
  }

  return { ok: true as const };
}
