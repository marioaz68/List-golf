import type { HoleGreenPoints } from "@/lib/distances/ccqHolePoints";
import { pointInPolygon, type Polygon } from "@/lib/telegram/ritmo/geometry";

/** ¿Dentro del polígono de green calibrado (sin tolerancia)? */
export function isPointOnGreen(
  lat: number,
  lon: number,
  calibratedPolygons: Polygon[],
  _holePoints?: HoleGreenPoints | null
): boolean {
  if (calibratedPolygons.length === 0) return false;
  const p = { lat, lon };
  return calibratedPolygons.some((poly) => pointInPolygon(p, poly));
}

function isPointInPolygons(
  lat: number,
  lon: number,
  polygons: Polygon[]
): boolean {
  if (polygons.length === 0) return false;
  const p = { lat, lon };
  return polygons.some((poly) => pointInPolygon(p, poly));
}

export function isPointInFairwayPolygon(
  lat: number,
  lon: number,
  fairwayPolygons: Polygon[]
): boolean {
  return isPointInPolygons(lat, lon, fairwayPolygons);
}

export function isPointInWaterPolygon(
  lat: number,
  lon: number,
  waterPolygons: Polygon[]
): boolean {
  return isPointInPolygons(lat, lon, waterPolygons);
}

export function isPointInBunkerPolygon(
  lat: number,
  lon: number,
  bunkerPolygons: Polygon[]
): boolean {
  return isPointInPolygons(lat, lon, bunkerPolygons);
}
