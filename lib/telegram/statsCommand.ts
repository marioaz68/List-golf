/**
 * Comando /ESTADISTICAS (y alias) — abre la Mini App de estadística personal
 * del jugador (distancias por palo, swing e historial de tiros).
 *
 * Usa un botón de tipo `web_app` para que Telegram inyecte el `initData`
 * firmado; así la ruta /api/mobile/stats identifica al jugador de forma
 * segura por su telegram_user_id (no confía en ids del cliente).
 */
import { telegramAppUrl } from "@/lib/telegram/appUrl";
import type { TelegramInlineButton } from "@/lib/telegram/sendMessage";

const COMMANDS = new Set([
  "ESTADISTICAS",
  "/ESTADISTICAS",
  "ESTADÍSTICAS",
  "/ESTADÍSTICAS",
  "MISDATOS",
  "/MISDATOS",
  "MISESTADISTICAS",
  "/MISESTADISTICAS",
  "STATS",
  "/STATS",
]);

export function isStatsCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

export function buildStatsReply(): {
  text: string;
  buttons: TelegramInlineButton[][];
} {
  const url = `${telegramAppUrl()}/mini/estadisticas`;
  return {
    text: [
      "📊 Tus estadísticas",
      "",
      "Abre tu ficha personal:",
      "  • Distancias por palo (promedio, mediana, máx)",
      "  • Métricas de swing (tempo, velocidad, plano)",
      "  • Historial de tus últimos tiros",
    ].join("\n"),
    buttons: [[{ text: "📊", web_app: url }]],
  };
}
