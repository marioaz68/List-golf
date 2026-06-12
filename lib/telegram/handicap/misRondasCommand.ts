/**
 * Comandos /RONDAS o /MISRONDAS en el bot — manda al socio el link a su
 * Mini App de histórico personal de rondas con HI calculado.
 */
import { telegramAppUrl } from "@/lib/telegram/appUrl";

const COMMANDS = new Set(["RONDAS", "/RONDAS", "MISRONDAS", "/MISRONDAS"]);

export function isMisRondasCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

function appUrl(): string {
  return telegramAppUrl();
}

export function buildMisRondasReply(telegramUserId: string): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  const url = `${appUrl()}/captura/mis-rondas?u=${encodeURIComponent(telegramUserId)}`;
  return {
    text: [
      "⛳ Tu histórico de rondas en el club",
      "",
      "Aquí ves todas las rondas que has registrado:",
      "  • Tu Handicap Index calculado",
      "  • Mejor gross y mejor diferencial",
      "  • Cada ronda con score hoyo por hoyo",
    ].join("\n"),
    buttons: [
      [
        {
          text: "📊 Abrir mis rondas",
          url,
        },
      ],
    ],
  };
}
