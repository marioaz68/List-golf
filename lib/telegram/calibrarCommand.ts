/**
 * Comando /CALIBRAR — abre la mini app de calibración del campo (mover greens
 * entrada/centro/atrás y marcar trampas/obstáculos capturando el GPS en sitio).
 *
 * Restringido: solo usuarios autorizados (ver lib/distances/calibrationAccess).
 */
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";
import { telegramAppUrl } from "@/lib/telegram/appUrl";

const COMMANDS = new Set([
  "CALIBRAR",
  "/CALIBRAR",
  "CALIBRACION",
  "/CALIBRACION",
  "CALIBRACIÓN",
  "/CALIBRACIÓN",
]);

export function isCalibrarCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

function appUrl(): string {
  return telegramAppUrl();
}

export function buildCalibrarReply(telegramUserId?: string | null): {
  text: string;
  buttons?: { text: string; url: string }[][];
} {
  const tg = String(telegramUserId ?? "").trim();

  if (!isCalibrationAllowed(tg)) {
    return {
      text: [
        "🔒 Calibración del campo",
        "",
        "Esta herramienta es solo para personal autorizado.",
        "Si necesitas acceso, contacta al administrador.",
      ].join("\n"),
    };
  }

  const url = `${appUrl()}/captura/calibrar?tg=${encodeURIComponent(tg)}`;
  return {
    text: [
      "🎯 Calibración del campo (CCQ)",
      "",
      "Abre la pantalla satélite y elige abajo qué calibrar:",
      "  • Salidas — tee de Negras/Azules/Blancas… (hoyo 1→18)",
      "  • Pts green — entrada / centro / atrás",
      "  • Fairway, bunkers, lagos, OB…",
      "",
      "Modo Salidas: elige color (ej. Negras), toca el tee en el mapa.",
      "Se guarda al instante y Yardas usa esa posición al pasar de hoyo.",
    ].join("\n"),
    buttons: [[{ text: "🎯 Abrir calibración", url }]],
  };
}
