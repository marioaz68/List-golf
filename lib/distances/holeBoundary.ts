import type { Feature, Polygon } from "@/lib/telegram/ritmo/geometry";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";

export type LatLon = { lat: number; lon: number };

/** Vértices del anillo exterior (sin repetir el cierre). */
export function ringFromPolygon(poly: Polygon): LatLon[] {
  const ring = poly.coordinates[0] ?? [];
  const n = ring.length - 1 > 0 ? ring.length - 1 : ring.length;
  return Array.from({ length: n }, (_, i) => ({
    lat: ring[i][1],
    lon: ring[i][0],
  }));
}

export function polygonFromRing(
  holeNo: number,
  verts: LatLon[]
): Feature<Polygon, { hoyo: number }> {
  const ring = verts.map((v) => [v.lon, v.lat] as [number, number]);
  if (ring.length > 0) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      ring.push([first[0], first[1]]);
    }
  }
  return {
    type: "Feature",
    properties: { hoyo: holeNo },
    geometry: { type: "Polygon", coordinates: [ring] },
  };
}

export function parseBoundaryGeoJson(raw: unknown): Polygon | null {
  if (!raw || typeof raw !== "object") return null;
  const g = raw as { type?: string; coordinates?: unknown };
  if (g.type !== "Polygon" || !Array.isArray(g.coordinates)) return null;
  return g as Polygon;
}

/** Polígono base del código o el calibrado si se pasa override. */
export function resolveHolePolygonFeature(
  holeNo: number,
  boundaryOverride?: Polygon | null
): Feature<Polygon, { hoyo: number }> | null {
  if (boundaryOverride) {
    return {
      type: "Feature",
      properties: { hoyo: holeNo },
      geometry: boundaryOverride,
    };
  }
  return CCQ_HOLES.features.find((f) => f.properties.hoyo === holeNo) ?? null;
}

export function defaultHoleRing(holeNo: number): LatLon[] {
  const f = CCQ_HOLES.features.find((x) => x.properties.hoyo === holeNo);
  if (!f) return [];
  return ringFromPolygon(f.geometry);
}
