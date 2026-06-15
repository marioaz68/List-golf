import type { LatLon } from "@/lib/distances/holeBoundary";

/** GeoJSON LineString mínimo (coordenadas [lon, lat]). */
export type LineStringGeo = { type: "LineString"; coordinates: [number, number][] };

const M_PER_DEG_LAT = 110_574;
function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

/** Construye un LineString GeoJSON a partir de waypoints (tee→green). */
export function lineFromWaypoints(verts: LatLon[]): LineStringGeo {
  return {
    type: "LineString",
    coordinates: verts.map((v) => [v.lon, v.lat] as [number, number]),
  };
}

/** Extrae los waypoints (orden tee→green) de un LineString. */
export function waypointsFromLine(raw: unknown): LatLon[] {
  if (!raw || typeof raw !== "object") return [];
  const g = raw as { type?: string; coordinates?: unknown };
  if (g.type !== "LineString" || !Array.isArray(g.coordinates)) return [];
  return (g.coordinates as unknown[])
    .filter(
      (c): c is [number, number] =>
        Array.isArray(c) && c.length >= 2 && typeof c[0] === "number" && typeof c[1] === "number"
    )
    .map((c) => ({ lat: c[1], lon: c[0] }));
}

export function parseCenterlineGeo(raw: unknown): LineStringGeo | null {
  const wps = waypointsFromLine(raw);
  return wps.length >= 2 ? lineFromWaypoints(wps) : null;
}

const YARD_M = 0.9144;

/** Marcas de yardas (distancia AL green) que se colocan en la línea central,
 *  según el par. Reutilizan el centro y el "atrás" del green que ya existen.
 *   - Par 3: 70
 *   - Par 4: 170, 70
 *   - Par 5: 300, 170, 70 */
export function centerlineYardMarks(par: number): number[] {
  const p = Math.round(par || 4);
  if (p <= 3) return [70];
  if (p >= 5) return [300, 170, 70];
  return [170, 70];
}

/**
 * Centerline por defecto (orden salida→green). Coloca la salida, luego las
 * marcas de yardas medidas DESDE el centro del green hacia la salida (70/170/
 * 300 según par) y termina con el centro y el "atrás" del green (que ya están
 * calibrados/centrados). El usuario solo acomoda los puntos intermedios en
 * Calibrar para seguir el dogleg.
 */
export function defaultCenterline(
  tee: LatLon,
  greenCenter: LatLon,
  greenBack: LatLon | null,
  par: number
): LatLon[] {
  const out: LatLon[] = [{ lat: tee.lat, lon: tee.lon }];

  // Vector green→salida en metros locales (dirección hacia atrás del green).
  const mLon = mPerDegLon(greenCenter.lat);
  const ex = (tee.lon - greenCenter.lon) * mLon;
  const ny = (tee.lat - greenCenter.lat) * M_PER_DEG_LAT;
  const len = Math.hypot(ex, ny);
  if (len > 0) {
    const ux = ex / len;
    const uy = ny / len;
    for (const yards of centerlineYardMarks(par)) {
      const d = yards * YARD_M;
      // Si el hoyo es más corto que la marca, esa marca queda detrás de la
      // salida: la omitimos.
      if (d >= len) continue;
      out.push({
        lat: greenCenter.lat + (uy * d) / M_PER_DEG_LAT,
        lon: greenCenter.lon + (ux * d) / mLon,
      });
    }
  }

  out.push({ lat: greenCenter.lat, lon: greenCenter.lon });
  if (
    greenBack &&
    (greenBack.lat !== greenCenter.lat || greenBack.lon !== greenCenter.lon)
  ) {
    out.push({ lat: greenBack.lat, lon: greenBack.lon });
  }
  return out;
}

/** Distancia (m) de un punto al segmento a-b, en plano local equirectangular. */
function distToSegmentM(p: LatLon, a: LatLon, b: LatLon): number {
  const mLon = mPerDegLon(p.lat);
  const ax = (a.lon - p.lon) * mLon;
  const ay = (a.lat - p.lat) * M_PER_DEG_LAT;
  const bx = (b.lon - p.lon) * mLon;
  const by = (b.lat - p.lat) * M_PER_DEG_LAT;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(cx, cy);
}

/** Distancia mínima (m) de un punto a una polilínea (waypoints en orden). */
export function distanceToCenterlineM(p: LatLon, line: LatLon[]): number {
  if (line.length === 0) return Infinity;
  if (line.length === 1) {
    const mLon = mPerDegLon(p.lat);
    return Math.hypot(
      (line[0].lon - p.lon) * mLon,
      (line[0].lat - p.lat) * M_PER_DEG_LAT
    );
  }
  let min = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distToSegmentM(p, line[i], line[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

/**
 * Siguiente waypoint hacia el que debe apuntar la foto: el primer punto de la
 * línea que queda "por delante" del jugador (proyección creciente hacia el
 * green). Si ya pasó todos, apunta al green (último). Devuelve el índice.
 */
export function aimWaypointIndex(p: LatLon, line: LatLon[]): number {
  if (line.length <= 1) return line.length - 1;
  // Encuentra el segmento más cercano; el aim es el extremo final de ese segmento.
  let bestSeg = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distToSegmentM(p, line[i], line[i + 1]);
    if (d < bestD) {
      bestD = d;
      bestSeg = i;
    }
  }
  return bestSeg + 1;
}
