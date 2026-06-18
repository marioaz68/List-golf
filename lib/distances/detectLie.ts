import {
  greenDistancesForHole,
  type HoleGreenPoints,
} from "@/lib/distances/ccqHolePoints";
import { isPointInBunker, type BunkerPoint } from "@/lib/distances/inBunker";
import { isPointOnGreen } from "@/lib/distances/onGreen";
import type { Polygon } from "@/lib/telegram/ritmo/geometry";

export interface LieContext {
  onGreen: boolean;
  inBunker: boolean;
}

/** Trampa manda sobre green (bunker junto al green → LW, no putt). */
export function detectLieAtPoint(
  lat: number,
  lon: number,
  greenPolygons: Polygon[],
  bunkerPolygons: Polygon[],
  bunkerPoints: BunkerPoint[],
  holePoints?: HoleGreenPoints | null
): LieContext {
  const inBunker = isPointInBunker(
    lat,
    lon,
    bunkerPolygons,
    bunkerPoints
  );
  const onGreen =
    !inBunker &&
    isPointOnGreen(lat, lon, greenPolygons, holePoints);
  return { onGreen, inBunker };
}
