import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";

/** Centro aproximado del polígono de un hoyo (CCQ). */
export function getHoleCenter(hoyo: number): { lat: number; lon: number } | null {
  if (hoyo < 1 || hoyo > 18) return null;
  const f = CCQ_HOLES.features.find((x) => x.properties.hoyo === hoyo);
  if (!f?.geometry?.coordinates?.[0]?.length) return null;
  const ring = f.geometry.coordinates[0];
  let lat = 0;
  let lon = 0;
  for (const [lng, latd] of ring) {
    lon += lng;
    lat += latd;
  }
  const n = ring.length;
  return { lat: lat / n, lon: lon / n };
}

/** Separa varios grupos en el mismo hoyo (pequeño abanico). */
export function offsetHolePosition(
  center: { lat: number; lon: number },
  index: number,
  total: number
): { lat: number; lon: number } {
  if (total <= 1 || index <= 0) return center;
  const angle = (index / total) * Math.PI * 2;
  const m = 0.00008;
  return {
    lat: center.lat + Math.sin(angle) * m,
    lon: center.lon + Math.cos(angle) * m,
  };
}
