/**
 * Comandos /DISTANCIAS o /YARDAS — manda link a la Mini App rangefinder.
 */
import { telegramAppUrl } from "@/lib/telegram/appUrl";

const COMMANDS = new Set(["DISTANCIAS", "/DISTANCIAS", "YARDAS", "/YARDAS"]);

export function isDistancesCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

function appUrl(): string {
  return telegramAppUrl();
}

export function buildDistancesReply(telegramUserId?: string | null): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  const tg = String(telegramUserId ?? "").trim();
  const url = tg
    ? `${appUrl()}/captura/distancias?tg=${encodeURIComponent(tg)}`
    : `${appUrl()}/captura/distancias`;
  return {
    text: [
      "📏 Yardas al green del CCQ",
      "",
      "Abre la pantalla con mapa satélite del campo:",
      "  • Frente, centro y fondo del green",
      "  • Yardas a todos los puntos del hoyo",
      "  • Toca el mapa para medir a cualquier punto",
      "  • Zoom automático al acercarte al green",
      "  • Semáforo de ritmo del campo en vivo",
    ].join("\n"),
    buttons: [[{ text: "📏 Abrir yardas", url }]],
  };
}
