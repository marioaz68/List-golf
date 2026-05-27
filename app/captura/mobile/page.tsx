/**
 * Versión pública de la captura "mobile" (anotar por hoyo). Reutiliza
 * exactamente el mismo componente cliente que usamos en backoffice, pero
 * vive fuera del grupo (backoffice) — para que el link del bot de
 * Telegram no pida login cuando el jugador o caddie lo abre.
 *
 * El componente cliente lee group_id (y opcionalmente me/caddie) de los
 * search params, así que no necesitamos pasarle nada por props.
 */
export { default } from "@/app/(backoffice)/score-entry/mobile/page";

export const dynamic = "force-dynamic";
export const revalidate = 0;
