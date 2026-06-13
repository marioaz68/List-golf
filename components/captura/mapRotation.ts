/**
 * Helpers compartidos para los mapas rotados de captura (yardas y calibrar).
 *
 * La rotación mantiene el green arriba y la ubicación del jugador (teléfono)
 * abajo, sin importar la orientación geográfica del hoyo. El zoom por
 * cercanía acerca progresivamente conforme el jugador avanza hacia el green.
 */

/** Escala del div del mapa vs. el viewport visible (evita esquinas negras al rotar). */
export const MAP_SCALE = 1.55;

/** Carga Leaflet desde CDN una sola vez. */
export async function loadLeaflet(): Promise<any> {
  if (!(window as any).L) {
    if (!document.querySelector("link[data-leaflet]")) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      css.setAttribute("data-leaflet", "1");
      document.head.appendChild(css);
    }
    await new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("Leaflet failed to load"));
      document.head.appendChild(s);
    });
  }
  return (window as any).L;
}

/** Envuelve el HTML de un marcador para contra-rotarlo y que quede legible. */
export function uprightHtml(html: string, bearing: number): string {
  if (bearing === 0) return html;
  return `<div style="transform:rotate(${bearing}deg);transform-origin:center center;">${html}</div>`;
}

/** Convierte un toque en pantalla a lat/lon considerando la rotación del mapa. */
export function screenToLatLng(
  clientX: number,
  clientY: number,
  containerRect: DOMRect,
  bearing: number,
  rotW: number,
  rotH: number,
  map: any,
  L: any
) {
  const cx = containerRect.left + containerRect.width / 2;
  const cy = containerRect.top + containerRect.height / 2;
  const x = clientX - cx;
  const y = clientY - cy;
  const rad = (bearing * Math.PI) / 180;
  const ux = x * Math.cos(rad) - y * Math.sin(rad);
  const uy = x * Math.sin(rad) + y * Math.cos(rad);
  return map.containerPointToLatLng(L.point(ux + rotW / 2, uy + rotH / 2));
}

/**
 * Ajusta el paneo para que jugador + green queden colocados verticalmente
 * (green arriba, jugador abajo) en la pantalla rotada.
 */
export function tuneRotatedFraming(
  map: any,
  bearing: number,
  playerLat: number,
  playerLon: number,
  greenLat: number,
  greenLon: number,
  viewportW: number,
  viewportH: number,
  rotW: number,
  rotH: number
) {
  const targetPlayerY = viewportH * 0.82;
  const targetGreenY = viewportH * 0.18;
  const targetCenterX = viewportW / 2;
  const rotRad = (-bearing * Math.PI) / 180;
  const panRad = (bearing * Math.PI) / 180;

  const toScreen = (lat: number, lon: number) => {
    const pt = map.latLngToContainerPoint([lat, lon]);
    const x = pt.x - rotW / 2;
    const y = pt.y - rotH / 2;
    return {
      x: viewportW / 2 + x * Math.cos(rotRad) - y * Math.sin(rotRad),
      y: viewportH / 2 + x * Math.sin(rotRad) + y * Math.cos(rotRad),
    };
  };

  for (let i = 0; i < 6; i++) {
    const ps = toScreen(playerLat, playerLon);
    const gs = toScreen(greenLat, greenLon);
    const errX = targetCenterX - (ps.x + gs.x) / 2;
    const errY = (targetPlayerY - ps.y + targetGreenY - gs.y) / 2;
    if (Math.abs(errX) < 2 && Math.abs(errY) < 2) break;
    const dpx = errX * Math.cos(panRad) - errY * Math.sin(panRad);
    const dpy = errX * Math.sin(panRad) + errY * Math.cos(panRad);
    map.panBy([dpx, dpy], { animate: false });
  }
}

/**
 * Encuadre por cercanía: ajusta el zoom para que la separación en pantalla
 * jugador→green crezca conforme te acercas (acerca más rápido cerca del
 * green), manteniendo siempre el green arriba y el punto azul abajo.
 */
export function frameByProximity(
  map: any,
  bearing: number,
  playerLat: number,
  playerLon: number,
  greenLat: number,
  greenLon: number,
  yardsToGreen: number,
  viewportW: number,
  viewportH: number,
  rotW: number,
  rotH: number,
  topBar = 64,
  bottomBar = 52
) {
  const usableH = Math.max(80, viewportH - topBar - bottomBar);

  // t: 0 lejos (≥220 yds) … 1 muy cerca (≤25 yds). La fracción de pantalla
  // que ocupa el tramo jugador→green sube de 0.6 a 0.95 → zoom progresivo.
  const t = Math.max(0, Math.min(1, (220 - yardsToGreen) / (220 - 25)));
  const spanFrac = 0.6 + 0.35 * t;
  const desiredPx = spanFrac * usableH;

  const curZoom = map.getZoom();
  const p1 = map.project([playerLat, playerLon], curZoom);
  const p2 = map.project([greenLat, greenLon], curZoom);
  const d0 = Math.hypot(p1.x - p2.x, p1.y - p2.y) || 1;
  let newZoom = curZoom + Math.log2(desiredPx / d0);
  newZoom = Math.max(15, Math.min(21, newZoom));
  map.setZoom(newZoom, { animate: false });

  const leftover = Math.max(0, usableH - desiredPx);
  const targetGreenY = topBar + leftover * 0.4;
  const targetPlayerY = viewportH - bottomBar - leftover * 0.6;
  const targetCenterX = viewportW / 2;
  const targetMidY = (targetGreenY + targetPlayerY) / 2;
  const rotRad = (-bearing * Math.PI) / 180;
  const panRad = (bearing * Math.PI) / 180;

  const toScreen = (lat: number, lon: number) => {
    const pt = map.latLngToContainerPoint([lat, lon]);
    const x = pt.x - rotW / 2;
    const y = pt.y - rotH / 2;
    return {
      x: viewportW / 2 + x * Math.cos(rotRad) - y * Math.sin(rotRad),
      y: viewportH / 2 + x * Math.sin(rotRad) + y * Math.cos(rotRad),
    };
  };

  for (let i = 0; i < 8; i++) {
    const ps = toScreen(playerLat, playerLon);
    const gs = toScreen(greenLat, greenLon);
    const errX = targetCenterX - (ps.x + gs.x) / 2;
    const errY = targetMidY - (ps.y + gs.y) / 2;
    if (Math.abs(errX) < 2 && Math.abs(errY) < 2) break;
    const dpx = errX * Math.cos(panRad) - errY * Math.sin(panRad);
    const dpy = errX * Math.sin(panRad) + errY * Math.cos(panRad);
    map.panBy([dpx, dpy], { animate: false });
  }
}
