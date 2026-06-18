import {
  greenDistancesForHole,
  type HoleGreenPoints,
} from "@/lib/distances/ccqHolePoints";
import { distanceToPolygonMeters } from "@/lib/distances/inBunker";
import { pointInPolygon, type Polygon } from "@/lib/telegram/ritmo/geometry";

/** Tolerancia (m) fuera del polígono de green (GPS / toque en mapa). */
export const GREEN_POLYGON_BUFFER_M = 22;

export type GreenDistances = {
  front: number;
  center: number;
  back: number;
};

/** ¿En superficie de green según frente/fondo/centro calibrados? */
export function isOnGreenByDistances(dist: GreenDistances): boolean {
  if (dist.center <= 40) return true;
  if (dist.front <= 45 && dist.back <= 45) return true;
  if (dist.center <= 55 && Math.min(dist.front, dist.back) <= 35) {
    return true;
  }
  return false;
}

/** Zona de putt (green + primeros metros de fringe). */
export function isInPuttingZone(dist: GreenDistances): boolean {
  if (isOnGreenByDistances(dist)) return true;
  return dist.center <= 50 && dist.front <= 55 && dist.back <= 55;
}

/** ¿La bola está en el green (polígono calibrado ± buffer, o distancias al pin)? */
export function isPointOnGreen(
  lat: number,
  lon: number,
  calibratedPolygons: Polygon[],
  holePoints?: HoleGreenPoints | null
): boolean {
  const p = { lat, lon };
  for (const poly of calibratedPolygons) {
    if (pointInPolygon(p, poly)) return true;
    if (distanceToPolygonMeters(p, poly) <= GREEN_POLYGON_BUFFER_M) {
      return true;
    }
  }
  if (!holePoints) return false;
  return isOnGreenByDistances(greenDistancesForHole(lat, lon, holePoints));
}
