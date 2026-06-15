import { haversineMeters } from "@/lib/distances/ccqGreens";
import type { FeatureCollection, LatLon, Polygon } from "@/lib/telegram/ritmo/geometry";
import { pointInPolygon } from "@/lib/telegram/ritmo/geometry";

/** Centros de green por hoyo (para desempatar traslapes en la salida). */
export type GreenCentersByHole = Record<number, LatLon>;

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

/** Semilla inicial cuando aún no hay hoyo automático: dentro del polígono, o
 *  el hoyo cuyo green está más cerca (NO el borde a 30 m, que brincaba al 2). */
export function seedAutoHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>,
  greenCenters: GreenCentersByHole
): number {
  const inside = detectInsideHole(p, holes, greenCenters);
  if (inside != null) return inside;

  let bestHole = 1;
  let bestD = Infinity;
  for (let h = 1; h <= 18; h++) {
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
