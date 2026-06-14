/**
 * Helpers compartidos para los mapas rotados de captura (yardas y calibrar).
 *
 * La rotación mantiene el green arriba y la ubicación del jugador (teléfono)
 * abajo, sin importar la orientación geográfica del hoyo. El zoom por
 * cercanía acerca progresivamente conforme el jugador avanza hacia el green.
 */

/** Escala del div del mapa vs. el viewport visible (evita esquinas negras al rotar). */
export const MAP_SCALE = 1.55;

/**
 * Capa satélite. Esri World Imagery es estable en cualquier dominio (los
 * tiles no oficiales de Google a veces responden 403 según el referrer y el
 * mapa quedaba en negro).
 */
export const SATELLITE_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
export const SATELLITE_ATTRIBUTION = "© Esri";

// Respaldo (Google satélite por subdominio) si Esri no responde en algún tile.
const SATELLITE_FALLBACK_URL =
  "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";

/**
 * Agrega la capa satélite al mapa con respaldo automático: si un tile de Esri
 * falla, se enciende una capa de respaldo por debajo para que nunca quede en
 * blanco. Sin detectRetina (causaba tiles en blanco en algunos dispositivos).
 */
export function addSatelliteLayers(map: any, L: any): void {
  const fallback = L.tileLayer(SATELLITE_FALLBACK_URL, {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 21,
    maxNativeZoom: 20,
    attribution: "© Google",
  });

  const primary = L.tileLayer(SATELLITE_TILE_URL, {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: SATELLITE_ATTRIBUTION,
  });

  let fallbackOn = false;
  primary.on("tileerror", () => {
    if (!fallbackOn) {
      fallbackOn = true;
      fallback.addTo(map);
      fallback.bringToBack();
    }
  });

  primary.addTo(map);
}

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

/** Tamaño del viewport visible y del div del mapa (Leaflet). */
export function readMapLayout(
  container: HTMLElement | null,
  mapEl: HTMLElement | null
): { viewportW: number; viewportH: number; rotW: number; rotH: number } {
  const vr = container?.getBoundingClientRect();
  const viewportW = vr ? Math.round(vr.width) : 0;
  const viewportH = vr ? Math.round(vr.height) : 0;
  const rotW = mapEl?.offsetWidth || Math.round(viewportW * MAP_SCALE);
  const rotH = mapEl?.offsetHeight || Math.round(viewportH * MAP_SCALE);
  return { viewportW, viewportH, rotW, rotH };
}
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

  for (let i = 0; i < 4; i++) {
    const ps = toScreen(playerLat, playerLon);
    const gs = toScreen(greenLat, greenLon);
    const errX = targetCenterX - (ps.x + gs.x) / 2;
    const errY = (targetPlayerY - ps.y + targetGreenY - gs.y) / 2;
    if (Math.abs(errX) < 3 && Math.abs(errY) < 3) break;
    // Pasos acotados: evita que el paneo se dispare lejos del hoyo.
    const rawDpx = errX * Math.cos(panRad) - errY * Math.sin(panRad);
    const rawDpy = errX * Math.sin(panRad) + errY * Math.cos(panRad);
    const cap = 48;
    const dpx = Math.max(-cap, Math.min(cap, rawDpx));
    const dpy = Math.max(-cap, Math.min(cap, rawDpy));
    map.panBy([dpx, dpy], { animate: false });
  }
}

/**
 * Encuadre por cercanía: primero fitBounds jugador→green (siempre se ve el
 * hoyo), luego acerca según yardas y ajusta green arriba / jugador abajo.
 */
export function frameByProximity(
  map: any,
  L: any,
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
  const bounds = L.latLngBounds(
    [playerLat, playerLon],
    [greenLat, greenLon]
  );

  // Paso 1: encuadre fiable — jugador y green siempre en pantalla.
  map.fitBounds(bounds, {
    paddingTopLeft: [20, topBar + 20],
    paddingBottomRight: [20, bottomBar + 20],
    animate: false,
    maxZoom: 19,
  });

  // Paso 2: acercar progresivamente conforme bajan las yardas.
  const t = Math.max(0, Math.min(1, (220 - yardsToGreen) / (220 - 25)));
  if (t > 0.05) {
    const extra = Math.min(1.5, t * 1.5);
    map.setZoom(Math.min(20, map.getZoom() + extra), { animate: false });
    map.panTo(
      [(playerLat + greenLat) / 2, (playerLon + greenLon) / 2],
      { animate: false }
    );
  }

  // Paso 3: ajuste fino vertical (green arriba, jugador abajo).
  tuneRotatedFraming(
    map,
    bearing,
    playerLat,
    playerLon,
    greenLat,
    greenLon,
    viewportW,
    viewportH,
    rotW,
    rotH
  );
}
