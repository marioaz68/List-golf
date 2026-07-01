import type { LatLon } from "@/lib/distances/holeBoundary";

/**
 * Normaliza el green a un diagrama con orientación FIJA: el frente (entrada)
 * siempre abajo y el fondo (atrás) siempre arriba, sin importar la orientación
 * real del hoyo. Devuelve coordenadas en el viewBox para dibujar en SVG.
 */

const M_PER_DEG_LAT = 110_574;
function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export interface GreenDiagramInput {
  front: LatLon;
  back: LatLon;
  center: LatLon;
  ring?: LatLon[] | null;
  flag?: LatLon | null;
  width: number;
  height: number;
  margin?: number;
}

export interface GreenDiagramOutput {
  ok: boolean;
  ringPoints: string; // "x,y x,y ..." para <polygon>
  front: { x: number; y: number };
  back: { x: number; y: number };
  flag: { x: number; y: number } | null;
}

export function normalizeGreenDiagram(
  input: GreenDiagramInput
): GreenDiagramOutput {
  const { front, back, center, ring, flag, width, height } = input;
  const margin = input.margin ?? 24;

  const origin = center;
  const mLon = mPerDegLon(origin.lat);
  const toLocal = (p: LatLon) => ({
    x: (p.lon - origin.lon) * mLon,
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  });

  const frontL = toLocal(front);
  const backL = toLocal(back);
  const ax = backL.x - frontL.x;
  const ay = backL.y - frontL.y;
  const alen = Math.hypot(ax, ay);
  if (alen < 1e-6) {
    return { ok: false, ringPoints: "", front: { x: 0, y: 0 }, back: { x: 0, y: 0 }, flag: null };
  }
  const ux = ax / alen;
  const uy = ay / alen; // frente→atrás
  const perpX = uy; // "derecha" mirando frente→atrás
  const perpY = -ux;

  // (lateral, along) para un punto: along desde el frente, lateral +=derecha.
  const proj = (p: LatLon) => {
    const l = toLocal(p);
    const dx = l.x - frontL.x;
    const dy = l.y - frontL.y;
    return {
      lat: dx * perpX + dy * perpY,
      along: dx * ux + dy * uy,
    };
  };

  const ringPts = ring && ring.length >= 3 ? ring.map(proj) : null;
  const pts = ringPts ? [...ringPts] : [];
  pts.push({ lat: 0, along: 0 }); // frente
  pts.push({ lat: 0, along: alen }); // atrás
  const flagP = flag ? proj(flag) : null;
  if (flagP) pts.push(flagP);

  let minLat = Infinity,
    maxLat = -Infinity,
    minAlong = Infinity,
    maxAlong = -Infinity;
  for (const p of pts) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.along < minAlong) minAlong = p.along;
    if (p.along > maxAlong) maxAlong = p.along;
  }
  const spanLat = Math.max(maxLat - minLat, 1);
  const spanAlong = Math.max(maxAlong - minAlong, 1);
  const scale = Math.min(
    (width - 2 * margin) / spanLat,
    (height - 2 * margin) / spanAlong
  );
  const usedW = spanLat * scale;
  const usedH = spanAlong * scale;
  const offX = (width - usedW) / 2;
  const offY = (height - usedH) / 2;

  // along mayor = más arriba (atrás arriba, frente abajo).
  const map = (p: { lat: number; along: number }) => ({
    x: offX + (p.lat - minLat) * scale,
    y: height - offY - (p.along - minAlong) * scale,
  });

  return {
    ok: true,
    ringPoints: ringPts
      ? ringPts.map(map).map((m) => `${m.x.toFixed(1)},${m.y.toFixed(1)}`).join(" ")
      : "",
    front: map({ lat: 0, along: 0 }),
    back: map({ lat: 0, along: alen }),
    flag: flagP ? map(flagP) : null,
  };
}
