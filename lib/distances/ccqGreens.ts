/**
 * Centro del green de cada hoyo del CCQ.
 *
 * Calculado a partir del PDF de coordenadas (lado "Arriba" del polígono =
 * green), promediando "Arriba izq" + "Arriba der" para obtener el centro.
 *
 * Precisión esperada: ±5-10m. Suficiente para mostrar yardas a green
 * (que típicamente se reportan en frente / centro / fondo con ~20 yds
 * de diferencia entre cada uno).
 *
 * Para mayor precisión en el futuro: capturar 3 puntos por green (front,
 * center, back) y guardarlos en tabla course_holes.
 */

import { ccqParForHole } from "@/lib/distances/ccqScorecard";

export interface GreenPoint {
  lat: number;
  lon: number;
  /** Par del hoyo (referencia). */
  par: number;
}

export const CCQ_GREEN_CENTERS: Record<number, GreenPoint> = {
  // Coordenadas del PDF Cordenadas-ccq.pdf; par = CCQ_COURSE_PARS
  1: { lat: 20.565451, lon: -100.409022, par: ccqParForHole(1) },
  2: { lat: 20.569517, lon: -100.407269, par: ccqParForHole(2) },
  3: { lat: 20.567710, lon: -100.406221, par: ccqParForHole(3) },
  4: { lat: 20.564200, lon: -100.408585, par: ccqParForHole(4) },
  5: { lat: 20.560940, lon: -100.408171, par: ccqParForHole(5) },
  6: { lat: 20.557369, lon: -100.407929, par: ccqParForHole(6) },
  7: { lat: 20.560997, lon: -100.407719, par: ccqParForHole(7) },
  8: { lat: 20.562842, lon: -100.407483, par: ccqParForHole(8) },
  9: { lat: 20.566581, lon: -100.405926, par: ccqParForHole(9) },
  // Hoyo 10: el PDF tenía la coordenada fuera del polígono del hoyo (al norte,
  // ~600 m del green real). El green está en el extremo sur del polígono (el
  // hoyo juega norte→sur). Centro estimado a ~15 yds del "atrás" calibrado.
  10: { lat: 20.563471, lon: -100.406969, par: ccqParForHole(10) },
  // Hoyo 11: el PDF tenía un typo ("20°33'88.01''" con 88 segundos inválido).
  // Uso el centroide del polígono CCQ_HOLES como fallback (cerca, no perfecto).
  11: { lat: 20.55964, lon: -100.40718, par: ccqParForHole(11) },
  12: { lat: 20.557063, lon: -100.407164, par: ccqParForHole(12) },
  13: { lat: 20.557464, lon: -100.411065, par: ccqParForHole(13) },
  14: { lat: 20.555639, lon: -100.407899, par: ccqParForHole(14) },
  15: { lat: 20.558924, lon: -100.405256, par: ccqParForHole(15) },
  16: { lat: 20.561392, lon: -100.404178, par: ccqParForHole(16) },
  17: { lat: 20.562731, lon: -100.405101, par: ccqParForHole(17) },
  18: { lat: 20.565801, lon: -100.405361, par: ccqParForHole(18) },
};

/** Distancia en metros entre dos puntos (Haversine). */
export function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function metersToYards(m: number): number {
  return m * 1.09361;
}

/** Rumbo inicial en grados (0 = norte, 90 = este) de (lat1,lon1) hacia (lat2,lon2). */
export function bearingDegrees(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δλ = toRad(lon2 - lon1);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export interface DistanceToHole {
  holeNo: number;
  par: number;
  distanceMeters: number;
  distanceYards: number;
}

/** Devuelve la distancia del jugador a CADA green del CCQ, ordenadas por
 *  proximidad. Sirve para sugerir "estás cerca del hoyo X". */
export function computeAllHoleDistances(
  playerLat: number,
  playerLon: number
): DistanceToHole[] {
  const out: DistanceToHole[] = [];
  for (const k of Object.keys(CCQ_GREEN_CENTERS)) {
    const holeNo = Number(k);
    const g = CCQ_GREEN_CENTERS[holeNo];
    const m = haversineMeters(playerLat, playerLon, g.lat, g.lon);
    out.push({
      holeNo,
      par: g.par,
      distanceMeters: m,
      distanceYards: metersToYards(m),
    });
  }
  out.sort((a, b) => a.distanceMeters - b.distanceMeters);
  return out;
}
