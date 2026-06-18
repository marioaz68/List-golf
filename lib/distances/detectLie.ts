import { haversineMeters } from "@/lib/distances/ccqGreens";
import type { HoleGreenPoints } from "@/lib/distances/ccqHolePoints";
import { distanceToCenterlineM, waypointsFromLine } from "@/lib/distances/centerline";
import {
  parseBoundaryGeoJson,
  ringFromPolygon,
  type LatLon,
} from "@/lib/distances/holeBoundary";
import {
  BUNKER_POINT_RADIUS_M,
  distanceToPolygonMeters,
  isPointInBunker,
  type BunkerPoint,
} from "@/lib/distances/inBunker";
import { isPointOnGreen } from "@/lib/distances/onGreen";
import type { Polygon } from "@/lib/telegram/ritmo/geometry";

export type LieKind = "ob" | "water" | "bunker" | "green" | "fairway" | "rough";

export const LIE_LABELS: Record<LieKind, string> = {
  ob: "OB",
  water: "Agua",
  bunker: "Trampa",
  green: "Green",
  fairway: "Fairway",
  rough: "Rough",
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
  }
}

/** Tolerancia (m) a la línea de OB calibrada. */
export const OB_LINE_BUFFER_M = 12;

/** Tolerancia (m) fuera del polígono de agua. */
export const WATER_POLYGON_BUFFER_M = 10;

export const WATER_POINT_RADIUS_M = BUNKER_POINT_RADIUS_M;

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

function isPointInBufferedPolygons(
  lat: number,
  lon: number,
  polygons: Polygon[],
  bufferM: number
): boolean {
  const p = { lat, lon };
  for (const poly of polygons) {
    if (distanceToPolygonMeters(p, poly) <= bufferM) return true;
  }
  return false;
}

function isPointNearReferencePoints(
  lat: number,
  lon: number,
  points: BunkerPoint[],
  radiusM: number
): boolean {
  for (const pt of points) {
    if (haversineMeters(lat, lon, pt.lat, pt.lon) <= radiusM) return true;
  }
  return false;
}

function isPointNearObLines(
  lat: number,
  lon: number,
  obLines: LatLon[][]
): boolean {
  const p = { lat, lon };
  for (const line of obLines) {
    if (line.length >= 2 && distanceToCenterlineM(p, line) <= OB_LINE_BUFFER_M) {
      return true;
    }
  }
  return false;
}

function isPointInWater(
  lat: number,
  lon: number,
  waterPolygons: Polygon[],
  waterPoints: BunkerPoint[]
): boolean {
  if (
    waterPolygons.length > 0 &&
    isPointInBufferedPolygons(
      lat,
      lon,
      waterPolygons,
      WATER_POLYGON_BUFFER_M
    )
  ) {
    return true;
  }
  return isPointNearReferencePoints(
    lat,
    lon,
    waterPoints,
    WATER_POINT_RADIUS_M
  );
}

function isPointInFairway(
  lat: number,
  lon: number,
  fairwayPolygons: Polygon[]
): boolean {
  return isPointInBufferedPolygons(lat, lon, fairwayPolygons, 0);
}

/** Prioridad: OB → agua → trampa → green → fairway → rough. */
export function detectLieAtPoint(
  lat: number,
  lon: number,
  greenPolygons: Polygon[],
  bunkerPolygons: Polygon[],
  bunkerPoints: BunkerPoint[],
  holePoints?: HoleGreenPoints | null,
  options?: {
    waterPolygons?: Polygon[];
    waterPoints?: BunkerPoint[];
    fairwayPolygons?: Polygon[];
    obLines?: LatLon[][];
  }
): LieContext {
  const waterPolygons = options?.waterPolygons ?? [];
  const waterPoints = options?.waterPoints ?? [];
  const fairwayPolygons = options?.fairwayPolygons ?? [];
  const obLines = options?.obLines ?? [];

  if (obLines.length > 0 && isPointNearObLines(lat, lon, obLines)) {
    return { kind: "ob", onGreen: false, inBunker: false };
  }

  if (
    (waterPolygons.length > 0 || waterPoints.length > 0) &&
    isPointInWater(lat, lon, waterPolygons, waterPoints)
  ) {
    return { kind: "water", onGreen: false, inBunker: false };
  }

  const inBunker = isPointInBunker(lat, lon, bunkerPolygons, bunkerPoints);
  if (inBunker) {
    return { kind: "bunker", onGreen: false, inBunker: true };
  }

  const onGreen = isPointOnGreen(lat, lon, greenPolygons, holePoints);
  if (onGreen) {
    return { kind: "green", onGreen: true, inBunker: false };
  }

  if (
    fairwayPolygons.length > 0 &&
    isPointInFairway(lat, lon, fairwayPolygons)
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
  }
}
