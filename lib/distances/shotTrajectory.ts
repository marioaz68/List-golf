import { bearingDegrees } from "@/lib/distances/ccqGreens";
import { yardsBetween } from "@/lib/distances/ccqHolePoints";
import type { SwingKind } from "@/lib/distances/clubCatalog";

const EARTH_RADIUS_M = 6371000;
const YARD_M = 0.9144;

/** Ángulos de lanzamiento típicos (amateur) por bastón y swing. */
const LAUNCH_ANGLE_BY_CLUB: Record<
  string,
  { full: number; three_quarter: number }
> = {
  driver: { full: 11, three_quarter: 9 },
  "3w": { full: 13, three_quarter: 11 },
  "5w": { full: 14, three_quarter: 12 },
  "7w": { full: 15, three_quarter: 13 },
  "9w": { full: 16, three_quarter: 14 },
  "2h": { full: 14, three_quarter: 12 },
  "3h": { full: 15, three_quarter: 13 },
  "4h": { full: 16, three_quarter: 14 },
  "5h": { full: 17, three_quarter: 15 },
  "6h": { full: 18, three_quarter: 16 },
  "3i": { full: 15, three_quarter: 13 },
  "4i": { full: 17, three_quarter: 15 },
  "5i": { full: 18, three_quarter: 16 },
  "6i": { full: 20, three_quarter: 18 },
  "7i": { full: 22, three_quarter: 20 },
  "8i": { full: 24, three_quarter: 22 },
  "9i": { full: 26, three_quarter: 24 },
  pw: { full: 28, three_quarter: 26 },
  w48: { full: 29, three_quarter: 27 },
  w50: { full: 30, three_quarter: 28 },
  w52: { full: 30, three_quarter: 28 },
  w54: { full: 31, three_quarter: 29 },
  sw: { full: 32, three_quarter: 30 },
  w58: { full: 33, three_quarter: 31 },
  lw: { full: 34, three_quarter: 32 },
  putter: { full: 0, three_quarter: 0 },
};

export type ShotPreview = {
  catalogId: string;
  swing: SwingKind;
  plannedYards: number;
};

export type CompletedShotArc = {
  strokeNo: number;
  from: { lat: number; lon: number };
  to: { lat: number; lon: number };
  catalogId: string;
  swing: SwingKind;
};

export function launchAngleForClub(
  catalogId: string,
  swing: SwingKind
): number {
  const row = LAUNCH_ANGLE_BY_CLUB[catalogId];
  if (!row) return swing === "full" ? 22 : 20;
  return swing === "full" ? row.full : row.three_quarter;
}

/** Proporción lateral de comba según grados de lanzamiento (más loft = más curva). */
export function arcBulgeRatio(launchDeg: number): number {
  if (launchDeg <= 0) return 0;
  const t = Math.min(1, launchDeg / 36);
  return 0.12 + Math.pow(t, 1.35) * 0.58;
}

export function arcBulgeYards(carryYards: number, launchDeg: number): number {
  if (launchDeg <= 0 || carryYards <= 0) return 0;
  const raw = carryYards * arcBulgeRatio(launchDeg);
  return Math.min(raw, Math.max(18, carryYards * 0.62));
}

/** Punto geográfico a N yardas y rumbo dado (0 = norte). */
export function pointAtBearingYards(
  lat: number,
  lon: number,
  bearingDeg: number,
  yards: number
): { lat: number; lon: number } {
  if (yards <= 0) return { lat, lon };
  const d = yards * YARD_M;
  const br = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const δ = d / EARTH_RADIUS_M;
  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) +
      Math.cos(φ1) * Math.sin(δ) * Math.cos(br)
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(br) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2)
    );
  return {
    lat: (φ2 * 180) / Math.PI,
    lon: (((λ2 * 180) / Math.PI + 540) % 360) - 180,
  };
}

function quadraticArcPoints(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  launchDeg: number,
  segments: number
): Array<{ lat: number; lon: number }> {
  const carryYards = yardsBetween(from.lat, from.lon, to.lat, to.lon);
  if (launchDeg <= 0 || carryYards <= 5) {
    return [from, to];
  }

  const bearing = bearingDegrees(from.lat, from.lon, to.lat, to.lon);
  const bulgeYds = arcBulgeYards(carryYards, launchDeg);
  const mid = {
    lat: (from.lat + to.lat) / 2,
    lon: (from.lon + to.lon) / 2,
  };
  const ctrl = pointAtBearingYards(mid.lat, mid.lon, bearing + 90, bulgeYds);

  const points: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push({
      lat: u * u * from.lat + 2 * u * t * ctrl.lat + t * t * to.lat,
      lon: u * u * from.lon + 2 * u * t * ctrl.lon + t * t * to.lon,
    });
  }
  return points;
}

/** Curva entre salida real y caída marcada (golpes confirmados). */
export function buildShotArcBetween(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  launchDeg: number,
  segments = 32
): Array<{ lat: number; lon: number }> {
  return quadraticArcPoints(from, to, launchDeg, segments);
}

/** Curva de vuelo en planta hacia rumbo + carry (preview al elegir bastón). */
export function buildShotArc(
  from: { lat: number; lon: number },
  bearingDeg: number,
  carryYards: number,
  launchDeg: number,
  segments = 32
): {
  points: Array<{ lat: number; lon: number }>;
  landing: { lat: number; lon: number };
} {
  const landing = pointAtBearingYards(
    from.lat,
    from.lon,
    bearingDeg,
    carryYards
  );
  const points = quadraticArcPoints(from, landing, launchDeg, segments);
  return { points, landing };
}
