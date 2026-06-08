/**
 * Vista pública del menú F&B para clientes (jugadores y caddies) desde la
 * Mini App de Telegram. Reutiliza el patrón de `/captura/grupo` y
 * `/captura/tarjeta`: anónima por query params (?me=... | ?caddie=...).
 *
 * El componente cliente lee los datos del backend (no SSR pesado) para
 * que se sienta instantánea — el usuario solo cambia de página dentro de
 * la misma Mini App.
 */
import MenuClient from "./MenuClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function MenuPage() {
  return <MenuClient />;
}
