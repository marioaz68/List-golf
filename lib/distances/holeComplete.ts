import { bearingDegrees } from "@/lib/distances/ccqGreens";
import { yardsBetween } from "@/lib/distances/ccqHolePoints";
import type { LieKind } from "@/lib/distances/detectLie";
import type { LatLon } from "@/lib/distances/holeBoundary";
import { pointAtBearingYards } from "@/lib/distances/shotTrajectory";

/** Distancia al centro (yds) para preguntar si el hoyo terminó. */
export const HOLE_COMPLETE_MAX_CENTER_YDS = 1;
/** Putt/chip corto en green: hasta 2 yds al hoyo. */
export const SHORT_PUTT_MAX_CENTER_YDS = 2;
export const SHORT_PUTT_MAX_PLANNED_YDS = 2;
/** Al marcar caída cerca del hoyo, la bola se ancla al centro calibrado. */
export const LANDING_SNAP_TO_CENTER_YDS = 3;

export function isHoleComplete(centerYards: number): boolean {
  return centerYards <= HOLE_COMPLETE_MAX_CENTER_YDS;
}

/** ¿Mostrar diálogo entró / dada / sigo jugando? */
export function shouldPromptHoleFinish(
  centerYards: number,
  pendingShot?: {
    catalogId: string;
    plannedYards: number;
  } | null,
  lieKind?: LieKind
): boolean {
  if (isHoleComplete(centerYards)) return true;
  if (
    lieKind === "green" &&
    pendingShot &&
    pendingShot.plannedYards <= SHORT_PUTT_MAX_PLANNED_YDS &&
    centerYards <= SHORT_PUTT_MAX_CENTER_YDS
  ) {
    return true;
  }
  return false;
}

/**
 * Putt/chip corto en green: al confirmar basto, pregunta entró/dada sin marcar
 * caída (tap-in ≤1 yd o putt de hasta 2 yds estando a ≤2 yds del hoyo).
 */
export function isTapInPutt(
  centerYards: number,
  catalogId: string,
  plannedYards: number,
  onGreen: boolean
): boolean {
  if (!onGreen) return false;
  if (
    plannedYards <= HOLE_COMPLETE_MAX_CENTER_YDS &&
    centerYards <= HOLE_COMPLETE_MAX_CENTER_YDS
  ) {
    return true;
  }
  return (
    plannedYards <= SHORT_PUTT_MAX_PLANNED_YDS &&
    centerYards <= SHORT_PUTT_MAX_CENTER_YDS
  );
}

/** Yardas al hoyo para putt (precisión 1 yd). */
export function puttYardsFromCenter(centerYards: number): number {
  return Math.max(1, Math.round(centerYards));
}

/** Distancia al hoyo desde la bola (1 yd) — para putts y estadística. */
export function puttDistanceToHole(ball: LatLon, center: LatLon): number {
  return puttYardsFromCenter(yardsToGreenCenter(ball, center));
}

/**
 * Bola a N yardas del hoyo, en la línea hoyo → punto marcado en el mapa.
 * Si el marcado queda más lejos o cerca, se acorta o alarga sobre esa misma línea.
 */
export function ballAtPuttYardsFromHole(
  center: LatLon,
  markPoint: LatLon,
  puttYards: number
): LatLon {
  const yds = puttYardsFromCenter(puttYards);
  if (yds <= 1) {
    return { lat: center.lat, lon: center.lon };
  }
  const markDist = yardsToGreenCenter(markPoint, center);
  const bearing =
    markDist < 0.5
      ? 0
      : bearingDegrees(center.lat, center.lon, markPoint.lat, markPoint.lon);
  return pointAtBearingYards(center.lat, center.lon, bearing, yds);
}

/** Yardas reales de un golpe (putt en green: 1 yd; resto: paso 5). */
export function strokeActualYards(
  from: LatLon,
  to: LatLon,
  lieKind?: LieKind,
  catalogId?: string
): number {
  const raw = yardsBetween(from.lat, from.lon, to.lat, to.lon);
  if (lieKind === "green" || catalogId === "putter") {
    return Math.max(1, Math.round(raw));
  }
  return Math.round(raw / 5) * 5;
}

export function yardsToGreenCenter(point: LatLon, center: LatLon): number {
  return yardsBetween(point.lat, point.lon, center.lat, center.lon);
}

/** Si la caída queda cerca del centro calibrado, usa ese punto (coincide con la bandera). */
export function snapLandingToGreenCenter(
  landing: LatLon,
  center: LatLon,
  centerYards?: number
): LatLon {
  const yds =
    centerYards ?? yardsToGreenCenter(landing, center);
  if (yds <= LANDING_SNAP_TO_CENTER_YDS) {
    return { lat: center.lat, lon: center.lon };
  }
  return landing;
}

/** Posición de la bola cuando entró al hoyo: siempre el centro calibrado. */
export function holedPinPosition(center: LatLon): LatLon {
  return { lat: center.lat, lon: center.lon };
}
