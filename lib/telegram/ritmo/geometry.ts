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

const M_PER_DEG_LAT = 110_574; // metros por grado de latitud (aprox)

/** Metros por grado de longitud a una latitud dada (se encoge con cos(lat)). */
function metersPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/** Distancia (m) de un punto a un segmento, en un plano local equirectangular
 *  centrado en el punto p (suficiente a escala de un campo de golf). */
function distPointToSegmentMeters(
  p: LatLon,
  a: number[],
  b: number[]
): number {
  const mLon = metersPerDegLon(p.lat);
  // Proyección local en metros relativa a p.
  const ax = (a[0] - p.lon) * mLon;
  const ay = (a[1] - p.lat) * M_PER_DEG_LAT;
  const bx = (b[0] - p.lon) * mLon;
  const by = (b[1] - p.lat) * M_PER_DEG_LAT;
  // p está en el origen (0,0).
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? (-(ax * dx + ay * dy)) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(cx, cy);
}

/** Distancia (m) del punto al borde más cercano del polígono. */
function minDistanceMeters(p: LatLon, poly: Polygon): number {
  let min = Infinity;
  for (const ring of poly.coordinates) {
    for (let i = 0; i < ring.length - 1; i++) {
      const d = distPointToSegmentMeters(p, ring[i], ring[i + 1]);
      if (d < min) min = d;
    }
  }
  return min;
}

const NEAR_THRESHOLD_M = 30; // metros: agarra puntos en green/tee/orilla del fairway

/** Centroide (promedio de vértices del anillo exterior) en metros relativo a p. */
function centroidDistanceMeters(p: LatLon, poly: Polygon): number {
  const ring = poly.coordinates[0] ?? [];
  if (ring.length === 0) return Infinity;
  let sx = 0;
  let sy = 0;
  // El anillo está cerrado (último = primero); no contar el repetido.
  const n = ring.length - 1 > 0 ? ring.length - 1 : ring.length;
  for (let i = 0; i < n; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
  }
  const clon = sx / n;
  const clat = sy / n;
  const mLon = metersPerDegLon(p.lat);
  return Math.hypot((clon - p.lon) * mLon, (clat - p.lat) * M_PER_DEG_LAT);
}

/** Devuelve el número de hoyo donde cae el punto. Si cae dentro de varios
 *  polígonos que se traslapan, gana el hoyo cuyo centroide está más cerca
 *  (evita sesgo por orden de la lista). Si no cae en ninguno, devuelve el del
 *  borde más cercano si está a ≤30 m, o null si está fuera del campo. */
export function detectHole(
  p: LatLon,
  holes: FeatureCollection<Polygon, { hoyo: number }>,
  nearThresholdM: number = NEAR_THRESHOLD_M
): number | null {
  const containing = holes.features.filter((f) =>
    pointInPolygon(p, f.geometry)
  );
  if (containing.length === 1) return containing[0].properties.hoyo;
  if (containing.length > 1) {
    let best = containing[0];
    let bestD = centroidDistanceMeters(p, best.geometry);
    for (let i = 1; i < containing.length; i++) {
      const d = centroidDistanceMeters(p, containing[i].geometry);
      if (d < bestD) {
        bestD = d;
        best = containing[i];
      }
    }
    return best.properties.hoyo;
  }

  // Fuera de todo polígono: el del borde más cercano si está a ≤ umbral.
  // Con nearThresholdM = 0 solo cuenta estar DENTRO de un polígono.
  if (nearThresholdM <= 0) return null;
  let best: number | null = null;
  let bestD = Infinity;
  for (const f of holes.features) {
    const d = minDistanceMeters(p, f.geometry);
    if (d < bestD) {
      bestD = d;
      best = f.properties.hoyo;
    }
  }
  return bestD <= nearThresholdM ? best : null;
}

export function centroid(points: LatLon[]): LatLon | null {
  if (points.length === 0) return null;
  const sum = points.reduce(
    (a, p) => ({ lat: a.lat + p.lat, lon: a.lon + p.lon }),
    { lat: 0, lon: 0 }
  );
  return { lat: sum.lat / points.length, lon: sum.lon / points.length };
}
