import type { LatLon } from "@/lib/distances/holeBoundary";
import { bearingDegrees } from "@/lib/distances/ccqGreens";
import { yardsBetween } from "@/lib/distances/ccqHolePoints";
import { pointAtBearingYards } from "@/lib/distances/shotTrajectory";

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
 * Segmento actual de la línea central (0 = entre el punto 0 y 1).
 * Sirve para elegir el escalón de zoom por tramo (par3→2, par4→3, par5→4).
 */
export function centerlineSegmentIndex(p: LatLon, line: LatLon[]): number {
  if (line.length <= 1) return 0;
  let bestSeg = 0;
  let bestD = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const d = distToSegmentM(p, line[i], line[i + 1]);
    if (d < bestD) {
      bestD = d;
      bestSeg = i;
    }
  }
  return bestSeg;
}

/**
 * Siguiente waypoint hacia el que debe apuntar la foto: el primer punto de la
 * línea que queda "por delante" del jugador (proyección creciente hacia el
 * green). Si ya pasó todos, apunta al green (último). Devuelve el índice.
 */
export function aimWaypointIndex(p: LatLon, line: LatLon[]): number {
  if (line.length <= 1) return line.length - 1;
  return centerlineSegmentIndex(p, line) + 1;
}

/**
 * Punto de caída a N yardas sobre la centerline (desde la bola proyectada
 * hacia adelante en el fairway).
 */
export function landingAtYardsAlongCenterline(
  from: LatLon,
  line: LatLon[],
  yards: number
): LatLon {
  if (line.length < 2 || yards <= 0) return from;

  const cum = centerlineCumulativeYards(line);
  const proj = projectOntoCenterline(from, line);
  const endYards = proj.yardsAlong + yards;
  return pointAtCumulativeYards(line, cum, endYards);
}

/** @deprecated Use landingAtYardsAlongCenterline */
export function pointAtYardsAlongCenterline(
  from: LatLon,
  line: LatLon[],
  yards: number
): LatLon {
  return landingAtYardsAlongCenterline(from, line, yards);
}

/**
 * Preview verde: línea recta bola→caída. La caída va en la centerline del
 * fairway; si el carry alcanza el green, caída en el centro del green.
 */
export function buildShotPreviewLine(
  from: LatLon,
  plannedYards: number,
  greenCenter: LatLon,
  centerline?: LatLon[] | null
): { path: LatLon[]; landing: LatLon } {
  if (plannedYards <= 0) return { path: [from], landing: from };

  const ydsToGreen = yardsBetween(
    from.lat,
    from.lon,
    greenCenter.lat,
    greenCenter.lon
  );

  let landing: LatLon;
  if (plannedYards >= ydsToGreen - 0.5) {
    landing = greenCenter;
  } else if (centerline && centerline.length >= 2) {
    landing = landingAtYardsAlongCenterline(from, centerline, plannedYards);
  } else {
    const bearing = bearingDegrees(
      from.lat,
      from.lon,
      greenCenter.lat,
      greenCenter.lon
    );
    landing = pointAtBearingYards(
      from.lat,
      from.lon,
      bearing,
      plannedYards
    );
  }

  return { path: [from, landing], landing };
}

/** @deprecated Use buildShotPreviewLine */
export function buildShotPreviewAlongCenterline(
  from: LatLon,
  line: LatLon[],
  plannedYards: number,
  greenCenter: LatLon
): { path: LatLon[]; landing: LatLon } {
  return buildShotPreviewLine(from, plannedYards, greenCenter, line);
}

/** Distancias acumuladas (yds) desde line[0] a cada vértice. */
function centerlineCumulativeYards(line: LatLon[]): number[] {
  const cum = [0];
  for (let i = 0; i < line.length - 1; i++) {
    cum.push(
      cum[i] + yardsBetween(line[i].lat, line[i].lon, line[i + 1].lat, line[i + 1].lon)
    );
  }
  return cum;
}

function interpolateLatLon(a: LatLon, b: LatLon, t: number): LatLon {
  return {
    lat: a.lat + (b.lat - a.lat) * t,
    lon: a.lon + (b.lon - a.lon) * t,
  };
}

function projectPointOnSegment(
  p: LatLon,
  a: LatLon,
  b: LatLon
): { point: LatLon; t: number } {
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
  return {
    point: interpolateLatLon(a, b, t),
    t,
  };
}

/** Proyección del jugador sobre la centerline + distancia acumulada (yds). */
export function projectOntoCenterline(
  p: LatLon,
  line: LatLon[]
): { point: LatLon; yardsAlong: number; segmentIndex: number } {
  if (line.length < 2) {
    return { point: p, yardsAlong: 0, segmentIndex: 0 };
  }
  const cum = centerlineCumulativeYards(line);
  let bestDistM = Infinity;
  let best = { point: line[0], yardsAlong: 0, segmentIndex: 0 };

  for (let i = 0; i < line.length - 1; i++) {
    const { point, t } = projectPointOnSegment(p, line[i], line[i + 1]);
    const dM = distToSegmentM(p, line[i], line[i + 1]);
    const segYds = yardsBetween(
      line[i].lat,
      line[i].lon,
      line[i + 1].lat,
      line[i + 1].lon
    );
    const yardsAlong = cum[i] + segYds * t;
    if (dM < bestDistM) {
      bestDistM = dM;
      best = { point, yardsAlong, segmentIndex: i };
    }
  }
  return best;
}

function pointAtCumulativeYards(
  line: LatLon[],
  cum: number[],
  yards: number
): LatLon {
  if (line.length === 0) return { lat: 0, lon: 0 };
  if (yards <= 0) return line[0];
  const total = cum[cum.length - 1];
  if (yards >= total) return line[line.length - 1];
  for (let i = 0; i < line.length - 1; i++) {
    if (yards <= cum[i + 1]) {
      const segLen = cum[i + 1] - cum[i];
      const t = segLen > 0 ? (yards - cum[i]) / segLen : 0;
      return interpolateLatLon(line[i], line[i + 1], t);
    }
  }
  return line[line.length - 1];
}
