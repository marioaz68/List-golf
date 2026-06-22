import type { SwingKind } from "@/lib/distances/clubCatalog";

const EARTH_RADIUS_M = 6371000;
const YARD_M = 0.9144;

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
