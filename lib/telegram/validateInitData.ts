import crypto from "crypto";

/**
 * Valida el `initData` de una Telegram Mini App (Web App).
 *
 * Telegram firma el initData con una clave derivada del token del bot. El
 * algoritmo oficial es:
 *   secret_key = HMAC_SHA256(key="WebAppData", message=bot_token)
 *   hash       = HMAC_SHA256(key=secret_key, message=data_check_string)
 * donde data_check_string son los pares clave=valor (menos `hash`) ordenados
 * alfabéticamente y unidos por "\n".
 *
 * Devuelve el usuario de Telegram si la firma es válida; si no, null.
 */

export type TelegramUser = {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
};

export type InitDataResult = {
  ok: boolean;
  user?: TelegramUser;
  error?: string;
};

/** Antigüedad máxima aceptada del initData (segundos). Por defecto 24 h. */
const MAX_AGE_SECONDS = 60 * 60 * 24;

export function validateTelegramInitData(initData: string, botToken?: string): InitDataResult {
  const token = (botToken ?? process.env.TELEGRAM_BOT_TOKEN)?.trim();
  if (!token) return { ok: false, error: "Falta TELEGRAM_BOT_TOKEN en el servidor" };
  if (!initData) return { ok: false, error: "Falta initData" };

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return { ok: false, error: "initData sin hash" };

  // data_check_string: todos los pares menos hash, ordenados por clave.
  const pairs: string[] = [];
  for (const [k, v] of params.entries()) {
    if (k === "hash") continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join("\n");

  const secretKey = crypto.createHmac("sha256", "WebAppData").update(token).digest();
  const computed = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Comparación en tiempo constante.
  const a = Buffer.from(computed, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return { ok: false, error: "Firma inválida" };
  }

  // Frescura: rechazar initData viejo.
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AGE_SECONDS) {
    return { ok: false, error: "initData expirado" };
  }

  // Usuario firmado.
  try {
    const userJson = params.get("user");
    if (!userJson) return { ok: false, error: "initData sin usuario" };
    const user = JSON.parse(userJson) as TelegramUser;
    if (!user?.id) return { ok: false, error: "Usuario sin id" };
    return { ok: true, user };
  } catch {
    return { ok: false, error: "Usuario ilegible" };
  }
}
