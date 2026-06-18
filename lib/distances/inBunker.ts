import { haversineMeters } from "@/lib/distances/ccqGreens";
import {
  pointInPolygon,
  type LatLon,
  type Polygon,
} from "@/lib/telegram/ritmo/geometry";

export interface BunkerPoint {
  lat: number;
  lon: number;
}

/** Radio (m) alrededor de un punto de trampa marcado en BD. */
export const BUNKER_POINT_RADIUS_M = 28;

/** Tolerancia (m) fuera del polígono de trampa (toque impreciso en mapa). */
export const BUNKER_POLYGON_BUFFER_M = 15;

function ringToLatLon(ring: number[][]): LatLon[] {
  return ring.map(([lon, lat]) => ({ lat, lon }));
}

function distancePointToSegmentMeters(
  p: LatLon,
  a: LatLon,
  b: LatLon
): number {
  const mPerDegLat = 110_574;
  const mPerDegLon = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const px = (p.lon - a.lon) * mPerDegLon;
  const py = (p.lat - a.lat) * mPerDegLat;
  const bx = (b.lon - a.lon) * mPerDegLon;
  const by = (b.lat - a.lat) * mPerDegLat;
  const len2 = bx * bx + by * by;
  if (len2 <= 0) return Math.hypot(px, py);
  const t = Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  const qx = px - t * bx;
  const qy = py - t * by;
  return Math.hypot(qx, qy);
}

/** Distancia mínima del punto al borde del polígono (0 si está dentro). */
export function distanceToPolygonMeters(p: LatLon, poly: Polygon): number {
  if (pointInPolygon(p, poly)) return 0;
  const ring = poly.coordinates[0] ?? [];
  if (ring.length < 2) return Infinity;
  const verts = ringToLatLon(ring);
  let min = Infinity;
  for (let i = 0; i < verts.length - 1; i++) {
    min = Math.min(
      min,
      distancePointToSegmentMeters(p, verts[i], verts[i + 1])
    );
  }
  if (verts.length >= 2) {
    const last = verts[verts.length - 1];
    const first = verts[0];
    min = Math.min(min, distancePointToSegmentMeters(p, last, first));
  }
  return min;
}

/** ¿La bola está en trampa calibrada (polígono o punto guardado)? */
export function isPointInBunker(
  lat: number,
  lon: number,
  bunkerPolygons: Polygon[],
  bunkerPoints: BunkerPoint[] = []
): boolean {
  const p = { lat, lon };
  for (const poly of bunkerPolygons) {
    if (distanceToPolygonMeters(p, poly) <= BUNKER_POLYGON_BUFFER_M) {
      return true;
    }
  }
  for (const bp of bunkerPoints) {
    if (haversineMeters(lat, lon, bp.lat, bp.lon) <= BUNKER_POINT_RADIUS_M) {
      return true;
    }
  }
  return false;
}
