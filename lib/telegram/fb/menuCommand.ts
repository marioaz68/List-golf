/**
 * Comando MENU en el bot @ListGolfBot — abre al socio/cliente la Mini App
 * del menú F&B para pedir (restaurante, carrito bar o reparto a domicilio
 * dentro del fraccionamiento).
 *
 * Sintaxis:
 *   MENU  ·  /MENU  ·  MENÚ  ·  CARTA
 *
 * El link se abre con ?u=<telegram_user_id> y la mini app resuelve en el
 * server al jugador/socio vinculado (y su entry más reciente si existe).
 */

const COMMANDS = new Set([
  "MENU",
  "/MENU",
  "MENÚ",
  "/MENÚ",
  "CARTA",
  "/CARTA",
]);

export function isMenuCommand(text: string): boolean {
  const cmd = text.trim().toUpperCase().split(/\s+/)[0];
  return COMMANDS.has(cmd);
}

function appUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.listgolf.club"
  );
}

export function buildMenuReply(telegramUserId: string): {
  text: string;
  buttons: { text: string; url: string }[][];
} {
  const url = `${appUrl()}/captura/menu?u=${encodeURIComponent(telegramUserId)}`;
  return {
    text: [
      "🍔 Menú del club",
      "",
      "Pide desde tu celular:",
      "  • 🏠 Recoger en el restaurante",
      "  • 🚚 Carrito bar en el campo",
      "  • 🏡 Reparto a tu casa en el fraccionamiento",
      "",
      "Toca el botón para abrir el menú.",
    ].join("\n"),
    buttons: [
      [
        {
          text: "🍔 Abrir menú",
          url,
        },
      ],
    ],
  };
}
