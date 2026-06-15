import type { Feature, FeatureCollection, Polygon } from "@/lib/telegram/ritmo/geometry";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import { parseBoundaryGeoJson } from "@/lib/distances/holeBoundary";

/** Polígonos por hoyo: calibrados en BD si existen, si no el del código. */
export function buildCourseHolesCollection(
  calibrated: ReadonlyMap<number, Polygon>
): FeatureCollection<Polygon, { hoyo: number }> {
  const features: Feature<Polygon, { hoyo: number }>[] = [];
  for (let hole = 1; hole <= 18; hole++) {
    const override = calibrated.get(hole);
    const base = CCQ_HOLES.features.find((f) => f.properties.hoyo === hole);
    const geometry = override ?? base?.geometry;
    if (!geometry) continue;
    features.push({
      type: "Feature",
      properties: { hoyo: hole },
      geometry,
    });
  }
  return { type: "FeatureCollection", features };
}

export function parseBoundariesPayload(
  rows: Array<{ hole_number: number; polygon: unknown }>
): Map<number, Polygon> {
  const out = new Map<number, Polygon>();
  for (const row of rows) {
    const poly = parseBoundaryGeoJson(row.polygon);
    if (poly) out.set(Number(row.hole_number), poly);
  }
  return out;
}
