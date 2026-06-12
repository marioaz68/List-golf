/**
 * Comando /CALIBRAR — abre la mini app de calibración del campo (mover greens
 * entrada/centro/atrás y marcar trampas/obstáculos capturando el GPS en sitio).
 *
 * Restringido: solo usuarios autorizados (ver lib/distances/calibrationAccess).
 */
import { isCalibrationAllowed } from "@/lib/distances/calibrationAccess";

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
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
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
      "Camina al punto real y captura tu posición GPS:",
      "  • Entrada / centro / atrás del green",
      "  • Trampas y obstáculos (bunker, agua, dogleg…)",
      "",
      "Párate en el punto exacto y toca el botón. Se guarda al instante",
      "y aparece en la mini app 📏 Yardas de los jugadores.",
    ].join("\n"),
    buttons: [[{ text: "🎯 Abrir calibración", url }]],
  };
}
