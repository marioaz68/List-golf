/**
 * Comandos /DISTANCIAS o /YARDAS — manda link a la Mini App rangefinder.
 * /YARDAS DEMO — versión en casa sin GPS (antes del match genérico de YARDAS).
 */
import { telegramAppUrl } from "@/lib/telegram/appUrl";

const COMMANDS = new Set(["DISTANCIAS", "/DISTANCIAS", "YARDAS", "/YARDAS"]);

const DEMO_COMMANDS = new Set([
  "YARDAS DEMO",
  "/YARDAS DEMO",
  "DISTANCIAS DEMO",
  "/DISTANCIAS DEMO",
  "YARDAS_DEMO",
  "/YARDAS_DEMO",
]);

export function isDistancesDemoCommand(text: string): boolean {
  const normalized = text.trim().toUpperCase().replace(/\s+/g, " ");
  return DEMO_COMMANDS.has(normalized);
}

export function isDistancesCommand(text: string): boolean {
  if (isDistancesDemoCommand(text)) return false;
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
      "",
      "¿Estás lejos del campo? Escribe YARDAS DEMO para probar en casa.",
    ].join("\n"),
    buttons: [
      [{ text: "📏 Abrir yardas", url }],
      [{ text: "🏠 Demo en casa", url: `${appUrl()}/captura/distancias?prueba=1${tg ? `&tg=${encodeURIComponent(tg)}` : ""}` }],
    ],
  };
}

export function buildDistancesDemoReply(telegramUserId?: string | null): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  const tg = String(telegramUserId ?? "").trim();
  const qs = tg ? `?tg=${encodeURIComponent(tg)}` : "";
  const url = `${appUrl()}/captura/distancias?prueba=1${tg ? `&tg=${encodeURIComponent(tg)}` : ""}`;
  const url3d = `${appUrl()}/captura/distancias/demo-3d${qs}`;
  return {
    text: [
      "🏠 Yardas DEMO (en casa)",
      "",
      "Prueba el medidor sin estar en el campo:",
      "  • Sin GPS ni límite de 300 m",
      "  • Simula tu posición con el deslizador tee→green",
      "  • Bolsa, tap en mapa y bastón sugerido",
      "  • Arriba puedes cambiar entre Satélite 2D y Preview 3D",
    ].join("\n"),
    buttons: [
      [{ text: "🏠 Demo satélite 2D", url }],
      [{ text: "🎮 Preview 3D (experimental)", url: url3d }],
    ],
  };
}
