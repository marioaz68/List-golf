// Tipos GeoJSON mínimos inline (evita dep @types/geojson)
export type Polygon = {
  type: "Polygon";
  coordinates: number[][][];
};
export type Feature<G, P> = {
  type: "Feature";
  geometry: G;
  properties: P;
};
export type FeatureCollection<G, P> = {
  type: "FeatureCollection";
  features: Feature<G, P>[];
};

export interface LatLon {
  lat: number;
  lon: number;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersects =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function pointInPolygon(p: LatLon, poly: Polygon): boolean {
  if (poly.type !== "Polygon") return false;
  const [outer, ...holes] = poly.coordinates;
  if (!pointInRing(p.lon, p.lat, outer)) return false;
  for (const hole of holes) if (pointInRing(p.lon, p.lat, hole)) return false;
  return true;
}

function minDistanceDeg(p: LatLon, poly: Polygon): number {
  let min = Infinity;
  for (const ring of poly.coordinates) {
    for (const [lon, lat] of ring) {
      const d = Math.hypot(p.lat - lat, p.lon - lon);
      if (d < min) min = d;
    }
  }
  return min;
}

const NEAR_THRESHOLD_DEG = 0.00025; // ≈ 25-28 m

/** Devuelve el número de hoyo donde cae el punto, o el más cercano si está
 *  a menos de ~25 m, o null si está fuera del campo. */
export function detectHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>
): number | null {
  for (const f of holes.features) {
    if (pointInPolygon(p, f.geometry)) return f.properties.hoyo;
  }
  let best: number | null = null;
  let bestD = Infinity;
  for (const f of holes.features) {
    const d = minDistanceDeg(p, f.geometry);
    if (d < bestD) { bestD = d; best = f.properties.hoyo; }
  }
  return bestD <= NEAR_THRESHOLD_DEG ? best : null;
}

export function centroid(points: LatLon[]): LatLon | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (a, p) => ({ lat: a.lat + p.lat, lon: a.lon + p.lon }),
    { lat: 0, lon: 0 }
  );
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}
