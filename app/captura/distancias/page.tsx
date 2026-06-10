/**
 * /captura/distancias — Mini App pública (sin auth) con mapa satélite del CCQ,
 * yardas al green (frente/centro/fondo), puntos de referencia y medición al tocar.
 */
import DistanciasClient from "./DistanciasClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DistanciasPage() {
  return <DistanciasClient />;
}
