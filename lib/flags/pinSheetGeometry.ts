import type { LatLon } from "@/lib/distances/holeBoundary";

/**
 * Convierte una captura de bandera por "pin sheet" (color + lado + 2 yardas) a
 * lat/lon, usando el frente/atrás del green y su circunferencia calibrada.
 *
 *   depthYards: en línea recta desde la orilla de referencia hasta la bandera.
 *               - roja (adelante) / blanca (medio) → desde el FRENTE.
 *               - azul (atrás)                      → desde ATRÁS.
 *   edgeYards:  de la bandera a la orilla del green del lado elegido (izq/der).
 *
 * La bandera queda a la profundidad indicada sobre el eje frente→atrás, y
 * desplazada al lado elegido de modo que quede a edgeYards de la orilla.
 */

const M_PER_DEG_LAT = 110_574;
const YARD_M = 0.9144;
function mPerDegLon(lat: number): number {
  return 111_320 * Math.cos((lat * Math.PI) / 180);
}

export type FlagColor = "roja" | "blanca" | "azul";
export type FlagSide = "left" | "right";

/** Zona según color: roja=frente, blanca=medio, azul=atrás. */
export function zoneForColor(color: FlagColor): "front" | "middle" | "back" {
  if (color === "azul") return "back";
  if (color === "blanca") return "middle";
  return "front";
}

export interface PinSheetInput {
  color: FlagColor;
  side: FlagSide;
  depthYards: number;
  edgeYards: number;
}

export interface GreenGeo {
  front: LatLon;
  back: LatLon;
  center: LatLon;
  /** Circunferencia calibrada del green (anillo de puntos). Opcional. */
  ring?: LatLon[] | null;
}

type XY = { x: number; y: number };

function toLocal(p: LatLon, origin: LatLon): XY {
  return {
    x: (p.lon - origin.lon) * mPerDegLon(origin.lat),
    y: (p.lat - origin.lat) * M_PER_DEG_LAT,
  };
}
function toLatLon(pt: XY, origin: LatLon): LatLon {
  return {
    lat: origin.lat + pt.y / M_PER_DEG_LAT,
    lon: origin.lon + pt.x / mPerDegLon(origin.lat),
  };
}

/** Intersección del rayo (desde P, dirección dir unitaria) con el anillo.
 *  Devuelve el punto de corte más cercano hacia adelante (t>0). */
function rayRingIntersection(
  P: XY,
  dir: XY,
  ring: XY[]
): XY | null {
  let best: { t: number; pt: XY } | null = null;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const sx = b.x - a.x;
    const sy = b.y - a.y;
    // P + t*dir = a + u*s  → resolver t,u
    const denom = dir.x * -sy - dir.y * -sx; // = dir × s
    if (Math.abs(denom) < 1e-9) continue;
    const dx = a.x - P.x;
    const dy = a.y - P.y;
    const t = (dx * -sy - dy * -sx) / denom;
    const u = (dir.x * dy - dir.y * dx) / denom;
    if (t > 0 && u >= 0 && u <= 1) {
      if (!best || t < best.t) {
        best = { t, pt: { x: P.x + dir.x * t, y: P.y + dir.y * t } };
      }
    }
  }
  return best ? best.pt : null;
}

/** Calcula lat/lon de la bandera. Devuelve null si faltan datos del green. */
export function computeFlagPosition(
  green: GreenGeo,
  input: PinSheetInput
): LatLon | null {
  if (!green.front || !green.back || !green.center) return null;
  const origin = green.center;
  const front = toLocal(green.front, origin);
  const back = toLocal(green.back, origin);

  const ax = back.x - front.x;
  const ay = back.y - front.y;
  const alen = Math.hypot(ax, ay);
  if (alen < 1e-6) return null;
  const ux = ax / alen;
  const uy = ay / alen; // unitario frente→atrás

  const zone = zoneForColor(input.color);
  // Punto de referencia y sentido hacia el interior del green.
  const ref = zone === "back" ? back : front;
  const dir =
    zone === "back" ? { x: -ux, y: -uy } : { x: ux, y: uy };

  const dA = input.depthYards * YARD_M;
  const P: XY = { x: ref.x + dir.x * dA, y: ref.y + dir.y * dA };

  // Perpendicular al eje. Mirando frente→atrás: izquierda = (-uy, ux).
  const perp: XY =
    input.side === "left" ? { x: -uy, y: ux } : { x: uy, y: -ux };

  const dB = input.edgeYards * YARD_M;

  const ring = green.ring;
  if (ring && ring.length >= 3) {
    const ringLocal = ring.map((p) => toLocal(p, origin));
    const edge = rayRingIntersection(P, perp, ringLocal);
    if (edge) {
      // La bandera queda dB adentro desde la orilla (hacia el eje = -perp).
      const flag: XY = {
        x: edge.x - perp.x * dB,
        y: edge.y - perp.y * dB,
      };
      return toLatLon(flag, origin);
    }
  }

  // Sin polígono calibrado: colocamos la bandera dB hacia el lado desde el eje
  // (aproximación razonable para que quede al lado indicado).
  const flag: XY = { x: P.x + perp.x * dB, y: P.y + perp.y * dB };
  return toLatLon(flag, origin);
}
