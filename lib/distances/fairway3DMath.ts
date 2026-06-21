import type { LatLon } from "@/lib/distances/holeBoundary";
import { yardsBetween } from "@/lib/distances/ccqHolePoints";

const M_PER_DEG_LAT = 110_574;

function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export type LocalPoint = { x: number; y: number; z: number };

export function createLocalProjector(origin: LatLon) {
  const mLon = mPerDegLon(origin.lat);
  return (p: LatLon): LocalPoint => ({
    x: (p.lon - origin.lon) * mLon,
    y: 0,
    z: -(p.lat - origin.lat) * M_PER_DEG_LAT,
  });
}

function segLen(a: LocalPoint, b: LocalPoint): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  return Math.hypot(dx, dz);
}

/** Punto a lo largo de la centerline (t=0 salida, t=1 centro del green). */
export function pointAlongCenterline(
  locals: LocalPoint[],
  t: number
): LocalPoint {
  if (locals.length === 0) return { x: 0, y: 0, z: 0 };
  if (locals.length === 1) return { ...locals[0] };

  const segments: number[] = [];
  let total = 0;
  for (let i = 0; i < locals.length - 1; i++) {
    const len = segLen(locals[i], locals[i + 1]);
    segments.push(len);
    total += len;
  }
  if (total <= 0) return { ...locals[0] };

  const target = Math.max(0, Math.min(1, t)) * total;
  let acc = 0;
  for (let i = 0; i < segments.length; i++) {
    const len = segments[i];
    if (acc + len >= target) {
      const u = len > 0 ? (target - acc) / len : 0;
      const a = locals[i];
      const b = locals[i + 1];
      return {
        x: a.x + (b.x - a.x) * u,
        y: 0,
        z: a.z + (b.z - a.z) * u,
      };
    }
    acc += len;
  }
  return { ...locals[locals.length - 1] };
}

export function yardsAlongCenterline(
  waypoints: LatLon[],
  t: number
): number | null {
  if (waypoints.length < 2) return null;
  const origin = waypoints[0];
  const locals = waypoints.map(createLocalProjector(origin));
  const pos = pointAlongCenterline(locals, t);
  const center = locals[locals.length - 2] ?? locals[locals.length - 1];
  const meters = Math.hypot(pos.x - center.x, pos.z - center.z);
  return Math.round(meters / 0.9144);
}

export function yardsFromPlayerToCenter(
  player: LatLon,
  center: LatLon
): number {
  return yardsBetween(player.lat, player.lon, center.lat, center.lon);
}
