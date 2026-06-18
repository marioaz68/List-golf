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
    if (calibratedPolygons.some((poly) => pointInPolygon(p, poly))) {
      return true;
    }
  }
  if (!holePoints) return false;
  const dist = greenDistancesForHole(lat, lon, holePoints);
  // Polígono ausente o impreciso: frente/fondo/centro cercanos ≈ en el green.
  return (
    dist.center <= 40 ||
    (dist.front <= 35 && dist.back <= 35)
  );
}
