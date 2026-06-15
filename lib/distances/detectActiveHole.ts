import { haversineMeters } from "@/lib/distances/ccqGreens";
import type { FeatureCollection, LatLon, Polygon } from "@/lib/telegram/ritmo/geometry";
import { pointInPolygon } from "@/lib/telegram/ritmo/geometry";

/** Centros de green por hoyo (para desempatar traslapes en la salida). */
export type GreenCentersByHole = Record<number, LatLon>;

/** Salidas (tee) por hoyo. Sirven de respaldo cuando estás fuera de todos los
 *  polígonos (p. ej. parado en las tees de atrás, que pueden quedar fuera de la
 *  línea azul): el hoyo correcto es el de la salida más cercana, NO el green. */
export type TeesByHole = Record<number, LatLon>;

/** Hoyo donde estás DENTRO del polígono. Si hay traslape, gana el cuyo green
 *  está más cerca (desde el tee suele ser el hoyo que estás jugando). */
export function detectInsideHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>,
  greenCenters: GreenCentersByHole
): number | null {
  const containing = holes.features.filter((f) =>
    pointInPolygon(p, f.geometry)
  );
  if (containing.length === 0) return null;
  if (containing.length === 1) return containing[0].properties.hoyo;

  let bestHole = containing[0].properties.hoyo;
  let bestD = Infinity;
  for (const f of containing) {
    const h = f.properties.hoyo;
    const g = greenCenters[h];
    if (!g) continue;
    const d = haversineMeters(p.lat, p.lon, g.lat, g.lon);
    if (d < bestD) {
      bestD = d;
      bestHole = h;
    }
  }
  return bestHole;
}

/** Semilla inicial cuando aún no hay hoyo automático.
 *  1) Si estás DENTRO de un polígono, ese hoyo (desempate por green cercano).
 *  2) Si estás FUERA de todos (típico en las tees de atrás), el hoyo de la
 *     SALIDA más cercana. Antes usaba el green más cercano y por eso en la
 *     salida del 1 brincaba al 3 (su green queda más cerca que el del 1). */
export function seedAutoHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>,
  greenCenters: GreenCentersByHole,
  tees?: TeesByHole
): number {
  const inside = detectInsideHole(p, holes, greenCenters);
  if (inside != null) return inside;

  // Respaldo: salida más cercana (mejor ancla en el tee). Si no hay tees,
  // cae al green más cercano como antes.
  const anchors = tees && Object.keys(tees).length > 0 ? tees : greenCenters;
  let bestHole = 1;
  let bestD = Infinity;
  for (let h = 1; h <= 18; h++) {
    const a = anchors[h];
    if (!a) continue;
    const d = haversineMeters(p.lat, p.lon, a.lat, a.lon);
    if (d < bestD) {
      bestD = d;
      bestHole = h;
    }
  }
  return bestHole;
}
