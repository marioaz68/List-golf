/**
 * Control de acceso para el módulo de calibración de campo (mover greens y
 * puntos desde la mini app en sitio).
 *
 * Por ahora solo Mario Álvarez Zerecero. Para agregar más personas: añade su
 * telegram_user_id a ALLOWED_TELEGRAM_IDS, o define la variable de entorno
 * CALIBRATION_TELEGRAM_IDS con IDs separados por coma.
 */

const ALLOWED_TELEGRAM_IDS: string[] = [
  "167311226", // Mario Álvarez Zerecero
];

function envIds(): string[] {
  const raw = process.env.CALIBRATION_TELEGRAM_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isCalibrationAllowed(telegramUserId?: string | null): boolean {
  const tg = String(telegramUserId ?? "").trim();
  if (!tg) return false;
  return ALLOWED_TELEGRAM_IDS.includes(tg) || envIds().includes(tg);
}
