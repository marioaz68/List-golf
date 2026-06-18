import { haversineMeters } from "@/lib/distances/ccqGreens";
import type { HoleGreenPoints } from "@/lib/distances/ccqHolePoints";
import { distanceToCenterlineM, waypointsFromLine } from "@/lib/distances/centerline";
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

/** Tolerancia (m) a la línea de OB calibrada (LineString, no polígono). */
export const OB_LINE_BUFFER_M = 12;

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
  }
): LieContext {
  void holePoints;
  void _bunkerPoints;
  void options?.waterPoints;

  const waterPolygons = options?.waterPolygons ?? [];
  const fairwayPolygons = options?.fairwayPolygons ?? [];
  const obLines = options?.obLines ?? [];

  if (obLines.length > 0 && isPointNearObLines(lat, lon, obLines)) {
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
  }
}
