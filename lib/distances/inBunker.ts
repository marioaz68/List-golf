import { haversineMeters } from "@/lib/distances/ccqGreens";
import { pointInPolygon, type Polygon } from "@/lib/telegram/ritmo/geometry";

export interface BunkerPoint {
  lat: number;
  lon: number;
}

/** Radio (m) alrededor de un punto de trampa marcado en BD. */
export const BUNKER_POINT_RADIUS_M = 18;

/** ¿La bola está en trampa calibrada (polígono o punto guardado)? */
export function isPointInBunker(
  lat: number,
  lon: number,
  bunkerPolygons: Polygon[],
  bunkerPoints: BunkerPoint[] = []
): boolean {
  const p = { lat, lon };
  if (bunkerPolygons.some((poly) => pointInPolygon(p, poly))) {
    return true;
  }
  for (const bp of bunkerPoints) {
    if (haversineMeters(lat, lon, bp.lat, bp.lon) <= BUNKER_POINT_RADIUS_M) {
      return true;
    }
  }
  return false;
}
