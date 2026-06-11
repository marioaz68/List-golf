import {
  CCQ_HOLE_POINTS,
  type HoleGreenPoints,
  type ReferencePoint,
} from "@/lib/distances/ccqHolePoints";

export interface LatLon {
  lat: number;
  lon: number;
}

export interface HoleGreenOverride {
  holeNumber: number;
  front: LatLon | null;
  center: LatLon | null;
  back: LatLon | null;
}

export function rowToGreenOverride(row: Record<string, unknown>): HoleGreenOverride {
  const holeNumber = Number(row.hole_number);
  const pick = (latKey: string, lonKey: string): LatLon | null => {
    const lat = row[latKey];
    const lon = row[lonKey];
    if (typeof lat !== "number" || typeof lon !== "number") return null;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  };
  return {
    holeNumber,
    front: pick("green_front_lat", "green_front_lon"),
    center: pick("green_center_lat", "green_center_lon"),
    back: pick("green_back_lat", "green_back_lon"),
  };
}

export function hasGreenOverride(o: HoleGreenOverride): boolean {
  return !!(o.front && o.center && o.back);
}

/** Combina defaults del polígono con coordenadas guardadas en BD. */
export function resolveHoleGreenPoints(
  holeNo: number,
  override?: HoleGreenOverride | null
): HoleGreenPoints {
  const base = CCQ_HOLE_POINTS[holeNo];
  if (!base) {
    throw new Error(`Hoyo ${holeNo} sin datos`);
  }
  if (!override || !hasGreenOverride(override)) return base;

  const front = override.front ?? base.front;
  const center = override.center ?? base.center;
  const back = override.back ?? base.back;

  const referencePoints: ReferencePoint[] = base.referencePoints.map((p) => {
    if (p.kind === "green-front") return { ...p, lat: front.lat, lon: front.lon };
    if (p.kind === "green-center") return { ...p, lat: center.lat, lon: center.lon };
    if (p.kind === "green-back") return { ...p, lat: back.lat, lon: back.lon };
    return p;
  });

  return { ...base, front, center, back, referencePoints };
}
