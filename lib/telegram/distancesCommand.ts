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
      "📏 Distancias al green del CCQ",
      "",
      "Abre la pantalla, da permiso de ubicación y verás:",
      "  • En qué hoyo estás parado",
      "  • Yardas al centro del green",
      "  • Tabla de los 18 hoyos cercanos",
    ].join("\n"),
    buttons: [[{ text: "📏 Abrir distancias", url: `${appUrl()}/captura/distancias` }]],
  };
}
