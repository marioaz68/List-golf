/**
 * Puntos de referencia por hoyo del CCQ para el rangefinder.
 *
 * Frente / centro / fondo del green se derivan de los polígonos de hoyo
 * (misma fuente que ritmo del campo) + centro del green del PDF de coords.
 * También incluye salida (tee) y esquinas del polígono como puntos fijos.
 */

import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import {
  CCQ_GREEN_CENTERS,
  haversineMeters,
  metersToYards,
} from "@/lib/distances/ccqGreens";

export type ReferencePointKind =
  | "green-front"
  | "green-center"
  | "green-back"
  | "tee"
  | "corner";

export interface ReferencePoint {
  id: string;
  label: string;
  shortLabel: string;
  lat: number;
  lon: number;
  kind: ReferencePointKind;
}

export interface HoleGreenPoints {
  holeNo: number;
  par: number;
  front: { lat: number; lon: number };
  center: { lat: number; lon: number };
  back: { lat: number; lon: number };
  tee: { lat: number; lon: number };
  referencePoints: ReferencePoint[];
}

const M_PER_DEG_LAT = 110_574;

function metersPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

function ringVertices(holeNo: number): Array<{ lat: number; lon: number }> {
  const f = CCQ_HOLES.features.find((x) => x.properties.hoyo === holeNo);
  if (!f) return [];
  const ring = f.geometry.coordinates[0] ?? [];
  const n = ring.length - 1 > 0 ? ring.length - 1 : ring.length;
  return Array.from({ length: n }, (_, i) => ({
    lat: ring[i][1],
    lon: ring[i][0],
  }));
}

function deriveHolePoints(holeNo: number): HoleGreenPoints {
  const meta = CCQ_GREEN_CENTERS[holeNo];
  const center = { lat: meta.lat, lon: meta.lon };
  const verts = ringVertices(holeNo);

  const ranked = verts
    .map((v) => ({
      v,
      d: haversineMeters(v.lat, v.lon, center.lat, center.lon),
    }))
    .sort((a, b) => a.d - b.d);

  const greenA = ranked[0]?.v ?? center;
  const greenB = ranked[1]?.v ?? center;
  const teeA = ranked[ranked.length - 1]?.v ?? center;
  const teeB = ranked[ranked.length - 2]?.v ?? teeA;
  const tee = {
    lat: (teeA.lat + teeB.lat) / 2,
    lon: (teeA.lon + teeB.lon) / 2,
  };

  const mLon = metersPerDegLon(center.lat);
  const dx = (center.lon - tee.lon) * mLon;
  const dy = (center.lat - tee.lat) * M_PER_DEG_LAT;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;

  function proj(p: { lat: number; lon: number }): number {
    const px = (p.lon - tee.lon) * mLon;
    const py = (p.lat - tee.lat) * M_PER_DEG_LAT;
    return px * ux + py * uy;
  }

  function pointAtProj(pProj: number): { lat: number; lon: number } {
    return {
      lat: tee.lat + (uy * pProj) / M_PER_DEG_LAT,
      lon: tee.lon + (ux * pProj) / mLon,
    };
  }

  const greenProjs = [proj(greenA), proj(greenB), proj(center)];
  const front = pointAtProj(Math.min(...greenProjs));
  const back = pointAtProj(Math.max(...greenProjs));

  const referencePoints: ReferencePoint[] = [
    {
      id: "green-f",
      label: "Frente del green",
      shortLabel: "F",
      lat: front.lat,
      lon: front.lon,
      kind: "green-front",
    },
    {
      id: "green-c",
      label: "Centro del green",
      shortLabel: "C",
      lat: center.lat,
      lon: center.lon,
      kind: "green-center",
    },
    {
      id: "green-b",
      label: "Fondo del green",
      shortLabel: "B",
      lat: back.lat,
      lon: back.lon,
      kind: "green-back",
    },
    {
      id: "tee",
      label: "Salida",
      shortLabel: "T",
      lat: tee.lat,
      lon: tee.lon,
      kind: "tee",
    },
  ];

  verts.forEach((v, i) => {
    referencePoints.push({
      id: `corner-${i}`,
      label: `Punto ${i + 1}`,
      shortLabel: `${i + 1}`,
      lat: v.lat,
      lon: v.lon,
      kind: "corner",
    });
  });

  return {
    holeNo,
    par: meta.par,
    front,
    center,
    back,
    tee,
    referencePoints,
  };
}

export const CCQ_HOLE_POINTS: Record<number, HoleGreenPoints> = Object.fromEntries(
  Array.from({ length: 18 }, (_, i) => {
    const n = i + 1;
    return [n, deriveHolePoints(n)];
  })
);

export function yardsBetween(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return Math.round(metersToYards(haversineMeters(lat1, lon1, lat2, lon2)));
}

export function greenDistances(
  playerLat: number,
  playerLon: number,
  holeNo: number
): { front: number; center: number; back: number } | null {
  const hp = CCQ_HOLE_POINTS[holeNo];
  if (!hp) return null;
  return {
    front: yardsBetween(playerLat, playerLon, hp.front.lat, hp.front.lon),
    center: yardsBetween(playerLat, playerLon, hp.center.lat, hp.center.lon),
    back: yardsBetween(playerLat, playerLon, hp.back.lat, hp.back.lon),
  };
}

export type ReferencePointWithYards = ReferencePoint & { yards: number };

export function referenceDistances(
  playerLat: number,
  playerLon: number,
  holeNo: number
): ReferencePointWithYards[] {
  const hp = CCQ_HOLE_POINTS[holeNo];
  if (!hp) return [];
  return hp.referencePoints.map((p) => ({
    ...p,
    yards: yardsBetween(playerLat, playerLon, p.lat, p.lon),
  }));
}

/** Zoom Leaflet según distancia al centro del green (más cerca = más zoom). */
export function zoomForYardsToCenter(yards: number): number {
  if (yards > 280) return 15;
  if (yards > 200) return 16;
  if (yards > 140) return 17;
  if (yards > 90) return 18;
  if (yards > 45) return 19;
  return 20;
}

export function getHolePolygon(holeNo: number) {
  return CCQ_HOLES.features.find((f) => f.properties.hoyo === holeNo) ?? null;
}
