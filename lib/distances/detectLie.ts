import type { HoleGreenPoints } from "@/lib/distances/ccqHolePoints";
import {
  centerlineSegmentIndex,
  distanceToCenterlineM,
  waypointsFromLine,
} from "@/lib/distances/centerline";
import {
  parseBoundaryGeoJson,
  ringFromPolygon,
  type LatLon,
} from "@/lib/distances/holeBoundary";
import type { BunkerPoint } from "@/lib/distances/inBunker";
import {
  isPointInBunkerPolygon,
  isPointInFairwayPolygon,
  isPointInWaterPolygon,
  isPointOnGreen,
} from "@/lib/distances/onGreen";
import type { Polygon } from "@/lib/telegram/ritmo/geometry";

export type LieKind =
  | "ob"
  | "water"
  | "bunker"
  | "green"
  | "fairway"
  | "rough"
  | "given";

export const LIE_LABELS: Record<LieKind, string> = {
  ob: "OB",
  water: "Agua",
  bunker: "Trampa",
  green: "Green",
  fairway: "Fairway",
  rough: "Rough",
  given: "Dada",
};

export function lieLabel(kind: LieKind): string {
  return LIE_LABELS[kind];
}

export function lieTextClass(kind: LieKind): string {
  switch (kind) {
    case "ob":
      return "text-red-300";
    case "water":
      return "text-sky-300";
    case "bunker":
      return "text-amber-200";
    case "green":
      return "text-emerald-200";
    case "fairway":
      return "text-lime-200";
    case "rough":
      return "text-orange-200";
    case "given":
      return "text-violet-200";
  }
}

export function lieChipClass(kind: LieKind): string {
  switch (kind) {
    case "ob":
      return "border-red-500/60 bg-red-950/90 text-red-100";
    case "water":
      return "border-sky-500/60 bg-sky-950/90 text-sky-100";
    case "bunker":
      return "border-amber-500/60 bg-amber-950/90 text-amber-100";
    case "green":
      return "border-emerald-500/60 bg-emerald-950/90 text-emerald-100";
    case "fairway":
      return "border-lime-500/60 bg-lime-950/90 text-lime-100";
    case "rough":
      return "border-orange-500/60 bg-orange-950/90 text-orange-100";
    case "given":
      return "border-violet-500/60 bg-violet-950/90 text-violet-100";
  }
}

/** Tolerancia (m) a la línea de OB calibrada (LineString, no polígono). */
export const OB_LINE_BUFFER_M = 12;

/** Máx. distancia (m) al tramo OB más cercano para contar "más allá de la línea". */
export const OB_PAST_LINE_MAX_M = 80;

const M_PER_DEG_LAT = 110_574;
function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export interface LieContext {
  kind: LieKind;
  onGreen: boolean;
  inBunker: boolean;
}

/** Convierte geojson de OB (LineString o polígono legacy) a waypoints. */
export function obLineFromGeojson(raw: unknown): LatLon[] {
  const wps = waypointsFromLine(raw);
  if (wps.length >= 2) return wps;
  const poly = parseBoundaryGeoJson(raw);
  return poly ? ringFromPolygon(poly) : [];
}

function cross2d(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

/** Lado del punto respecto al segmento a→b (+1 izquierda, -1 derecha, 0 en línea). */
function sideOfSegment(p: LatLon, a: LatLon, b: LatLon): number {
  const mLon = mPerDegLon(p.lat);
  const abx = (b.lon - a.lon) * mLon;
  const aby = (b.lat - a.lat) * M_PER_DEG_LAT;
  const apx = (p.lon - a.lon) * mLon;
  const apy = (p.lat - a.lat) * M_PER_DEG_LAT;
  const c = cross2d(abx, aby, apx, apy);
  if (Math.abs(c) < 1e-3) return 0;
  return c > 0 ? 1 : -1;
}

/** Ancla del hoyo activo más cercana al tramo OB (salida, centerline, green). */
function pickInBoundsRefForSegment(
  refs: LatLon[],
  a: LatLon,
  b: LatLon
): LatLon | null {
  if (refs.length === 0) return null;
  const segment = [a, b];
  let best = refs[0];
  let bestD = distanceToCenterlineM(refs[0], segment);
  for (let i = 1; i < refs.length; i++) {
    const d = distanceToCenterlineM(refs[i], segment);
    if (d < bestD) {
      bestD = d;
      best = refs[i];
    }
  }
  return best;
}

/** OB si la bola queda al otro lado de la línea que el hoyo activo (p. ej. h1→
 *  derecha OB, h2→ izquierda OB en la misma línea de campo). */
function isPointOnObSideOfLine(
  p: LatLon,
  line: LatLon[],
  inBoundsRefs: LatLon[]
): boolean {
  if (line.length < 2 || inBoundsRefs.length === 0) return false;
  const dist = distanceToCenterlineM(p, line);
  if (dist > OB_PAST_LINE_MAX_M) return false;

  const segIdx = centerlineSegmentIndex(p, line);
  const a = line[segIdx];
  const b = line[segIdx + 1];
  const sideP = sideOfSegment(p, a, b);
  if (sideP === 0) return dist <= OB_LINE_BUFFER_M;

  const inBoundsRef = pickInBoundsRefForSegment(inBoundsRefs, a, b);
  if (!inBoundsRef) return false;
  const sideRef = sideOfSegment(inBoundsRef, a, b);
  if (sideRef === 0) return false;
  return sideP !== sideRef;
}

function isPointOb(
  lat: number,
  lon: number,
  obLines: LatLon[][],
  inBoundsRefs?: LatLon[] | null
): boolean {
  const p = { lat, lon };
  const refs = inBoundsRefs ?? [];
  for (const line of obLines) {
    if (line.length < 2) continue;
    if (isPointOnObSideOfLine(p, line, refs)) return true;
  }
  return false;
}

/** Puntos del hoyo activo que marcan el lado válido (in-bounds) de la línea OB. */
export function activeHoleInBoundsRefs(input: {
  teeMark?: LatLon | null;
  tee?: LatLon | null;
  centerline?: LatLon[] | null;
  green?: LatLon | null;
}): LatLon[] {
  const refs: LatLon[] = [];
  const seen = new Set<string>();
  const push = (pt?: LatLon | null) => {
    if (!pt) return;
    const key = `${pt.lat.toFixed(6)},${pt.lon.toFixed(6)}`;
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(pt);
  };
  push(input.teeMark);
  push(input.tee);
  for (const pt of input.centerline ?? []) push(pt);
  push(input.green);
  return refs;
}

/** Prioridad: OB → agua → trampa → green → fairway → rough. Solo polígonos (sin buffer). */
export function detectLieAtPoint(
  lat: number,
  lon: number,
  greenPolygons: Polygon[],
  bunkerPolygons: Polygon[],
  _bunkerPoints: BunkerPoint[],
  holePoints?: HoleGreenPoints | null,
  options?: {
    waterPolygons?: Polygon[];
    waterPoints?: BunkerPoint[];
    fairwayPolygons?: Polygon[];
    obLines?: LatLon[][];
    /** Anclas del hoyo activo (salida, centerline, green) para el lado válido de OB. */
    inBoundsRefs?: LatLon[] | null;
  }
): LieContext {
  void holePoints;
  void _bunkerPoints;
  void options?.waterPoints;

  const waterPolygons = options?.waterPolygons ?? [];
  const fairwayPolygons = options?.fairwayPolygons ?? [];
  const obLines = options?.obLines ?? [];

  if (
    obLines.length > 0 &&
    isPointOb(lat, lon, obLines, options?.inBoundsRefs)
  ) {
    return { kind: "ob", onGreen: false, inBunker: false };
  }

  if (waterPolygons.length > 0 && isPointInWaterPolygon(lat, lon, waterPolygons)) {
    return { kind: "water", onGreen: false, inBunker: false };
  }

  if (bunkerPolygons.length > 0 && isPointInBunkerPolygon(lat, lon, bunkerPolygons)) {
    return { kind: "bunker", onGreen: false, inBunker: true };
  }

  if (greenPolygons.length > 0 && isPointOnGreen(lat, lon, greenPolygons, holePoints)) {
    return { kind: "green", onGreen: true, inBunker: false };
  }

  if (
    fairwayPolygons.length > 0 &&
    isPointInFairwayPolygon(lat, lon, fairwayPolygons)
  ) {
    return { kind: "fairway", onGreen: false, inBunker: false };
  }

  return { kind: "rough", onGreen: false, inBunker: false };
}

/** Etiqueta corta para toasts: "Quedó en Rough · 120 al centro". */
export function lieArrivalPhrase(kind: LieKind): string {
  switch (kind) {
    case "ob":
      return "OB";
    case "water":
      return "en agua";
    case "bunker":
      return "en trampa";
    case "green":
      return "en el green";
    case "fairway":
      return "en fairway";
    case "rough":
      return "en rough";
    case "given":
      return "dada";
  }
}
