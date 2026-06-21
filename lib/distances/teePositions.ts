import { CCQ_HOLE_POINTS } from "@/lib/distances/ccqHolePoints";
import type { LatLon } from "@/lib/distances/holeBoundary";

export type TeeSetCode = "BLK" | "BLU" | "WHT" | "GLD" | "RED";

export const CCQ_CALIBRATION_TEE_SETS: ReadonlyArray<{
  code: TeeSetCode;
  name: string;
  chipClass: string;
  markerColor: string;
}> = [
  {
    code: "BLK",
    name: "Negras",
    chipClass: "border-slate-500 bg-slate-900 text-slate-100",
    markerColor: "#111827",
  },
  {
    code: "BLU",
    name: "Azules",
    chipClass: "border-blue-500 bg-blue-950 text-blue-100",
    markerColor: "#2563eb",
  },
  {
    code: "WHT",
    name: "Blancas",
    chipClass: "border-slate-300 bg-slate-100 text-slate-900",
    markerColor: "#f8fafc",
  },
  {
    code: "GLD",
    name: "Doradas",
    chipClass: "border-amber-500 bg-amber-950 text-amber-100",
    markerColor: "#ca8a04",
  },
  {
    code: "RED",
    name: "Rojas",
    chipClass: "border-red-500 bg-red-950 text-red-100",
    markerColor: "#dc2626",
  },
];

const CODE_ALIASES: Record<string, TeeSetCode> = {
  BLK: "BLK",
  NEGRAS: "BLK",
  NEGRA: "BLK",
  BLACK: "BLK",
  BLU: "BLU",
  AZUL: "BLU",
  AZULES: "BLU",
  BLUE: "BLU",
  WHT: "WHT",
  BLANCAS: "WHT",
  BLANCA: "WHT",
  WHITE: "WHT",
  GLD: "GLD",
  GOLD: "GLD",
  DORADAS: "GLD",
  DORADA: "GLD",
  RED: "RED",
  ROJAS: "RED",
  ROJA: "RED",
};

export function normalizeTeeSetCode(raw: string | null | undefined): TeeSetCode {
  const key = String(raw ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  return CODE_ALIASES[key] ?? "BLK";
}

export type TeePositionsByCode = Partial<Record<TeeSetCode, Record<number, LatLon>>>;

export function indexTeePositionRows(
  rows: Array<{
    hole_number: number;
    tee_set_code: string;
    lat: number;
    lon: number;
  }>
): TeePositionsByCode {
  const out: TeePositionsByCode = {};
  for (const row of rows) {
    const code = normalizeTeeSetCode(row.tee_set_code);
    const hole = Number(row.hole_number);
    const lat = Number(row.lat);
    const lon = Number(row.lon);
    if (!Number.isFinite(hole) || hole < 1 || hole > 18) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (!out[code]) out[code] = {};
    out[code]![hole] = { lat, lon };
  }
  return out;
}

export function teeSetLabel(code: TeeSetCode): string {
  return CCQ_CALIBRATION_TEE_SETS.find((t) => t.code === code)?.name ?? code;
}

/** Salida calibrada del hoyo/color, o la salida default del catálogo. */
export function resolveTeePosition(
  hole: number,
  teeCode: TeeSetCode,
  calibrated: TeePositionsByCode
): LatLon | null {
  const custom = calibrated[teeCode]?.[hole];
  if (custom) return custom;
  return CCQ_HOLE_POINTS[hole]?.tee ?? null;
}

export function hasCalibratedTeePosition(
  hole: number,
  teeCode: TeeSetCode,
  calibrated: TeePositionsByCode
): boolean {
  return Boolean(calibrated[teeCode]?.[hole]);
}
