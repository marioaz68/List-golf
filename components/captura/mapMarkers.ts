/** HTML inline para marcadores de mapa (Leaflet divIcon). */

export function golfBallHtml(size = 14, accentRing?: string): string {
  const ring = accentRing
    ? `box-shadow:0 0 0 2px ${accentRing},0 1px 4px rgba(0,0,0,0.5);`
    : "box-shadow:0 1px 4px rgba(0,0,0,0.5);";
  return `<div style="width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 32% 26%,#ffffff 0%,#f5f5f0 42%,#d4d0c8 100%);border:1.5px solid rgba(255,255,255,0.95);${ring}"></div>`;
}

/** Bola en tee (salida del jugador). */
export function teeBallHtml(size = 14): string {
  const peg = 5;
  return `<div style="position:relative;width:${size}px;height:${size + peg}px;">
    <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:3px;height:${peg}px;background:linear-gradient(#4ade80,#16a34a);border-radius:1px;"></div>
    <div style="position:absolute;top:0;left:0;width:${size}px;height:${size}px;border-radius:50%;background:radial-gradient(circle at 32% 26%,#ffffff 0%,#f5f5f0 42%,#d4d0c8 100%);border:1.5px solid rgba(255,255,255,0.95);box-shadow:0 0 0 2px #22c55e,0 1px 4px rgba(0,0,0,0.5);"></div>
  </div>`;
}
