import {
  greenDistancesForHole,
  type HoleGreenPoints,
} from "@/lib/distances/ccqHolePoints";
import { pointInPolygon, type Polygon } from "@/lib/telegram/ritmo/geometry";

/** ¿La bola está dentro del área del green calibrada o, si no hay, cerca de pin? */
export function isPointOnGreen(
  lat: number,
  lon: number,
  calibratedPolygons: Polygon[],
  holePoints?: HoleGreenPoints | null
): boolean {
  const p = { lat, lon };
  if (calibratedPolygons.length > 0) {
    return calibratedPolygons.some((poly) => pointInPolygon(p, poly));
  }
  if (!holePoints) return false;
  const dist = greenDistancesForHole(lat, lon, holePoints);
  // Sin polígono: frente y fondo cercanos ≈ dentro del green (~30 yds de fondo).
  return dist.front <= 35 && dist.back <= 35;
}
