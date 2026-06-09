/**
 * /captura/distancias — Mini App pública (sin auth) que muestra al jugador
 * cuántas yardas tiene al green de cada hoyo del CCQ.
 *
 * Independiente de torneos / rondas. El jugador la abre desde el botón
 * "📏 Distancias" en la mini app de Telegram, lee su GPS y ve un panel
 * con el hoyo donde está + los siguientes 3 hoyos a la vista.
 */
import DistanciasClient from "./DistanciasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DistanciasPage() {
  return <DistanciasClient />;
}
