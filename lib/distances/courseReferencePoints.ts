/**
 * Puntos de referencia del campo guardados en BD (bunkers, agua, dogleg…).
 */

export const CCQ_COURSE_ID = "4bd3a144-dfe4-49f0-b11c-1d80132a7e63";

export type DbReferencePointKind =
  | "bunker"
  | "water"
  | "dogleg"
  | "hazard"
  | "other"
  | "custom";

export interface DbReferencePoint {
  id: string;
  courseId: string;
  holeNumber: number;
  label: string;
  shortLabel: string;
  kind: DbReferencePointKind;
  lat: number;
  lon: number;
  sortOrder: number;
}

export const REFERENCE_KIND_LABELS: Record<DbReferencePointKind, string> = {
  bunker: "Bunker",
  water: "Agua",
  dogleg: "Dogleg",
  hazard: "Obstáculo",
  other: "Otro",
  custom: "Personalizado",
};

export function rowToDbReferencePoint(row: Record<string, unknown>): DbReferencePoint {
  const label = String(row.label ?? "").trim();
  const short =
    String(row.short_label ?? "").trim() ||
    label.slice(0, 3).toUpperCase() ||
    "?";
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    holeNumber: Number(row.hole_number),
    label,
    shortLabel: short.slice(0, 6),
    kind: (String(row.kind ?? "other") as DbReferencePointKind) || "other",
    lat: Number(row.lat),
    lon: Number(row.lon),
    sortOrder: Number(row.sort_order ?? 0),
  };
}

export function dbPointToMapReference(p: DbReferencePoint) {
  return {
    id: p.id,
    label: p.label,
    shortLabel: p.shortLabel,
    lat: p.lat,
    lon: p.lon,
    kind: "custom" as const,
    dbKind: p.kind,
  };
}
