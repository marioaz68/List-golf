/**
 * Comandos /DISTANCIAS o /YARDAS — manda link a la Mini App rangefinder.
 */
const COMMANDS = new Set(["DISTANCIAS", "/DISTANCIAS", "YARDAS", "/YARDAS"]);

export function isDistancesCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
}

export function buildDistancesReply(): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  return {
    text: [
      "📏 Yardas al green del CCQ",
      "",
      "Abre la pantalla con mapa satélite del campo:",
      "  • Frente, centro y fondo del green",
      "  • Yardas a todos los puntos del hoyo",
      "  • Toca el mapa para medir a cualquier punto",
      "  • Zoom automático al acercarte al green",
    ].join("\n"),
    buttons: [[{ text: "📏 Abrir distancias", url: `${appUrl()}/captura/distancias` }]],
  };
}
