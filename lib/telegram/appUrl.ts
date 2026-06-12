/**
 * URL base pública para links/botones que se mandan por Telegram.
 *
 * Telegram RECHAZA botones cuyo URL sea localhost o http simple, así que si la
 * variable de entorno está vacía, mal puesta (localhost / 127.0.0.1) o no es
 * https, caemos al dominio de producción. Esto evita que un comando "no haga
 * nada" porque sendMessage falló por un botón inválido.
 */
const PRODUCTION_URL = "https://www.listgolf.club";

export function telegramAppUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim().replace(/\/$/, "");
  if (!raw) return PRODUCTION_URL;
  if (/localhost|127\.0\.0\.1/i.test(raw)) return PRODUCTION_URL;
  if (!/^https:\/\//i.test(raw)) return PRODUCTION_URL;
  return raw;
}
