const TELEGRAM_API = "https://api.telegram.org/bot";

export function getTelegramBotUsername() {
  return (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim() ?? ""
  );
}

export function getTelegramBotUrl(startPayload?: string | null) {
  const user = getTelegramBotUsername();
  if (!user) return null;
  const base = `https://t.me/${user}`;
  const payload = String(startPayload ?? "").trim();
  if (!payload) return base;
  return `${base}?start=${encodeURIComponent(payload)}`;
}

export type TelegramSendErrorKind =
  | "chat_not_found"
  | "bot_blocked"
  | "other";

/** Clasifica errores fatales de chat (no reintentar; marcar inválido). */
export function classifyTelegramSendError(
  description: string | null | undefined,
  httpStatus?: number | null
): TelegramSendErrorKind {
  const d = String(description ?? "").toLowerCase();
  if (
    d.includes("chat not found") ||
    d.includes("chat_id is empty") ||
    d.includes("user not found") ||
    (httpStatus === 400 && d.includes("chat"))
  ) {
    return "chat_not_found";
  }
  if (
    d.includes("bot was blocked by the user") ||
    d.includes("user is deactivated") ||
    d.includes("forbidden: bot was blocked") ||
    (httpStatus === 403 && (d.includes("blocked") || d.includes("forbidden")))
  ) {
    return "bot_blocked";
  }
  if (httpStatus === 403) return "bot_blocked";
  return "other";
}

export type TelegramInlineButton = {
  text: string;
  /** Botón que abre un link normal (navegador in-app, sin initData). */
  url?: string;
  /** Botón que abre una Mini App DENTRO de Telegram (inyecta initData firmado). */
  web_app?: string;
};

export async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
  /** Botones tappables (inline_keyboard). Cada array interior es una fila. */
  buttons?: TelegramInlineButton[][];
  /** Si true, se desactiva el preview del link (deja la tarjeta sin imagen grande). */
  disablePreview?: boolean;
}): Promise<
  | { ok: true; messageId: number | null }
  | { ok: false; error: string; errorKind: TelegramSendErrorKind }
> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return {
      ok: false as const,
      error: "Falta TELEGRAM_BOT_TOKEN en el servidor.",
      errorKind: "other",
    };
  }

  const chatId = params.chatId.trim();
  if (!chatId) {
    return {
      ok: false as const,
      error: "Falta chat ID de Telegram.",
      errorKind: "other",
    };
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
        row.map((b) =>
          b.web_app
            ? { text: b.text, web_app: { url: b.web_app } }
            : { text: b.text, url: b.url }
        )
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
    result?: { message_id?: number | null } | null;
  } | null;

  if (!res.ok || response?.ok === false) {
    const error = response?.description ?? `Telegram API HTTP ${res.status}`;
    return {
      ok: false as const,
      error,
      errorKind: classifyTelegramSendError(error, res.status),
    };
  }

  const messageId = response?.result?.message_id ?? null;
  return { ok: true as const, messageId };
}

/**
 * Borra un mensaje del bot en el chat. Best-effort: Telegram solo
 * permite borrar mensajes propios y los enviados hace menos de 48h
 * (excepto chats donde el bot es admin). Cualquier error se devuelve
 * pero no es fatal para el flujo de notificaciones.
 */
export async function deleteTelegramMessage(
  chatId: string,
  messageId: number | string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    return { ok: false, error: "Falta TELEGRAM_BOT_TOKEN en el servidor." };
  }
  const cid = String(chatId ?? "").trim();
  const mid = String(messageId ?? "").trim();
  if (!cid || !mid) {
    return { ok: false, error: "Faltan chat_id o message_id." };
  }
  const res = await fetch(`${TELEGRAM_API}${token}/deleteMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: cid, message_id: mid }),
  });
  const body = (await res.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
  } | null;
  if (!res.ok || body?.ok === false) {
    return {
      ok: false,
      error: body?.description ?? `Telegram API HTTP ${res.status}`,
    };
  }
  return { ok: true };
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
