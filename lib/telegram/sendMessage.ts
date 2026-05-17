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

export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
}) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false as const, error: "Falta TELEGRAM_BOT_TOKEN en el servidor." };
  }

  const chatId = params.chatId.trim();
  if (!chatId) {
    return { ok: false as const, error: "Falta chat ID de Telegram." };
  }

  const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: params.text,
    }),
  });

  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;

  if (!res.ok || body?.ok === false) {
    return {
      ok: false as const,
      error: body?.description ?? `Telegram API HTTP ${res.status}`,
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
