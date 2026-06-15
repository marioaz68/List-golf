import { haversineMeters } from "@/lib/distances/ccqGreens";
import { distanceToCenterlineM } from "@/lib/distances/centerline";
import type { FeatureCollection, LatLon, Polygon } from "@/lib/telegram/ritmo/geometry";
import { pointInPolygon } from "@/lib/telegram/ritmo/geometry";

/** Centros de green por hoyo (para desempatar traslapes en la salida). */
export type GreenCentersByHole = Record<number, LatLon>;

/** Línea central de fairway por hoyo (salida→green). Es la señal más fuerte
 *  para saber qué hoyo juegas: recorre todo el hoyo, así que la distancia a
 *  ella desambigua traslapes mejor que el green o el tee aislados. */
export type CenterlinesByHole = Record<number, LatLon[]>;

/** Hoyo cuya línea central está más cerca del punto. Devuelve null si la más
 *  cercana queda a más de `maxDistM` (no estás sobre ningún fairway). */
export function nearestCenterlineHole(
  p: LatLon,
  centerlines: CenterlinesByHole,
  maxDistM = 70
): { hole: number; dist: number } | null {
  let bestHole = 0;
  let bestD = Infinity;
  for (let h = 1; h <= 18; h++) {
    const line = centerlines[h];
    if (!line || line.length < 2) continue;
    const d = distanceToCenterlineM(p, line);
    if (d < bestD) {
      bestD = d;
      bestHole = h;
    }
  }
  if (bestHole === 0 || bestD > maxDistM) return null;
  return { hole: bestHole, dist: bestD };
}

/** Salidas (tee) por hoyo. Sirven de respaldo cuando estás fuera de todos los
 *  polígonos (p. ej. parado en las tees de atrás, que pueden quedar fuera de la
 *  línea azul): el hoyo correcto es el de la salida más cercana, NO el green. */
export type TeesByHole = Record<number, LatLon>;

/** Hoyo donde estás DENTRO del polígono. Si hay traslape, gana el de la línea
 *  central más cercana (o, si no hay centerlines, el del green más cercano). */
export function detectInsideHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>,
  greenCenters: GreenCentersByHole,
  centerlines?: CenterlinesByHole
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
    let d: number;
    const line = centerlines?.[h];
    if (line && line.length >= 2) {
      d = distanceToCenterlineM(p, line);
    } else {
      const g = greenCenters[h];
      if (!g) continue;
      d = haversineMeters(p.lat, p.lon, g.lat, g.lon);
    }
    if (d < bestD) {
      bestD = d;
      bestHole = h;
    }
  }
  return bestHole;
}

/** Detección combinada: la línea central manda. Útil para traslapes y para
 *  cuando estás fuera del polígono pero claramente sobre un fairway.
 *  1) Si la centerline más cercana está a < `clMaxDistM`, ese hoyo.
 *  2) Si no, el polígono que te contiene (desempate por centerline/green).
 *  3) Si nada aplica, null. */
export function detectHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>,
  greenCenters: GreenCentersByHole,
  centerlines?: CenterlinesByHole,
  clMaxDistM = 45
): number | null {
  if (centerlines) {
    const cl = nearestCenterlineHole(p, centerlines, clMaxDistM);
    if (cl) return cl.hole;
  }
  return detectInsideHole(p, holes, greenCenters, centerlines);
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
  tees?: TeesByHole,
  centerlines?: CenterlinesByHole
): number {
  // 1) La línea central es la señal más confiable (cubre todo el hoyo).
  if (centerlines) {
    const cl = nearestCenterlineHole(p, centerlines, 70);
    if (cl) return cl.hole;
  }
  const inside = detectInsideHole(p, holes, greenCenters, centerlines);
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
