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
 * Capa satélite. Google muestra el campo de golf en alta definición (Esri
 * tiene imágenes viejas/de baja resolución en algunas zonas, p. ej. el CCQ se
 * veía como matorral). Esri queda como respaldo si Google falla algún tile.
 */
export const SATELLITE_TILE_URL =
  "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}";
export const SATELLITE_ATTRIBUTION = "© Google";

// Respaldo (Esri World Imagery) si Google no responde en algún tile.
const SATELLITE_FALLBACK_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

/**
 * Agrega la capa satélite al mapa con respaldo automático: si un tile del
 * proveedor principal falla, se enciende una capa de respaldo por debajo para
 * que nunca quede en blanco. Sin detectRetina (causaba tiles en blanco en
 * algunos dispositivos).
 */
export function addSatelliteLayers(map: any, L: any): void {
  const fallback = L.tileLayer(SATELLITE_FALLBACK_URL, {
    maxZoom: 21,
    maxNativeZoom: 19,
    attribution: "© Esri",
  });

  const primary = L.tileLayer(SATELLITE_TILE_URL, {
    subdomains: ["0", "1", "2", "3"],
    maxZoom: 21,
    maxNativeZoom: 20,
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
  map: any,
  L: any
) {
  const mapSize = map.getSize();
  const cx = containerRect.left + containerRect.width / 2;
  const cy = containerRect.top + containerRect.height / 2;
  const x = clientX - cx;
  const y = clientY - cy;
  const rad = (bearing * Math.PI) / 180;
  const ux = x * Math.cos(rad) - y * Math.sin(rad);
  const uy = x * Math.sin(rad) + y * Math.cos(rad);
  return map.containerPointToLatLng(
    L.point(ux + mapSize.x / 2, uy + mapSize.y / 2)
  );
}

/**
 * Convierte lat/lon a posición en el viewport visible, considerando la
 * rotación CSS del contenedor del mapa.
 */
function toRotatedScreen(
  map: any,
  lat: number,
  lon: number,
  bearing: number,
  viewportW: number,
  viewportH: number
) {
  const mapSize = map.getSize();
  const pt = map.latLngToContainerPoint([lat, lon]);
  const x = pt.x - mapSize.x / 2;
  const y = pt.y - mapSize.y / 2;
  const rotRad = (-bearing * Math.PI) / 180;
  return {
    x: viewportW / 2 + x * Math.cos(rotRad) - y * Math.sin(rotRad),
    y: viewportH / 2 + x * Math.sin(rotRad) + y * Math.cos(rotRad),
  };
}

/**
 * Pan del mapa para mover un punto en pantalla (viewport) por (dx, dy).
 * `panBy` mueve la vista, por lo que los puntos geográficos se desplazan en
 * sentido contrario: por eso negamos el resultado de la rotación.
 */
function panScreenDelta(
  map: any,
  bearing: number,
  dx: number,
  dy: number
) {
  const panRad = (bearing * Math.PI) / 180;
  const dpx = dx * Math.cos(panRad) - dy * Math.sin(panRad);
  const dpy = dx * Math.sin(panRad) + dy * Math.cos(panRad);
  map.panBy([-dpx, -dpy], { animate: false });
}

/**
 * Coloca el green arriba y el jugador abajo en pantalla (tras rotar el mapa).
 * Usa el punto "atrás" del green como referencia superior.
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
  _rotW: number,
  _rotH: number,
  topBar = 64,
  bottomBar = 52
) {
  const targetGreenY = topBar + (viewportH - topBar - bottomBar) * 0.12;
  const targetPlayerY = viewportH - bottomBar - (viewportH - topBar - bottomBar) * 0.08;
  const targetCenterX = viewportW / 2;

  for (let i = 0; i < 16; i++) {
    const ps = toRotatedScreen(
      map,
      playerLat,
      playerLon,
      bearing,
      viewportW,
      viewportH
    );
    const gs = toRotatedScreen(
      map,
      greenLat,
      greenLon,
      bearing,
      viewportW,
      viewportH
    );
    const errX = targetCenterX - (ps.x + gs.x) / 2;
    const errGreenY = targetGreenY - gs.y;
    const errPlayerY = targetPlayerY - ps.y;
    if (
      Math.abs(errX) < 2 &&
      Math.abs(errGreenY) < 3 &&
      Math.abs(errPlayerY) < 3
    ) {
      break;
    }
    // Prioriza que el green quede arriba y el jugador abajo.
    panScreenDelta(map, bearing, errX * 0.65, (errGreenY * 0.5 + errPlayerY * 0.5) * 0.65);
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
  bottomBar = 52,
  extraBounds?: Array<[number, number]>
) {
  const bounds = L.latLngBounds(
    [playerLat, playerLon],
    [greenLat, greenLon]
  );
  if (extraBounds) {
    for (const pt of extraBounds) bounds.extend(pt);
  }

  map.fitBounds(bounds, {
    paddingTopLeft: [24, topBar + 24],
    paddingBottomRight: [24, bottomBar + 24],
    animate: false,
    maxZoom: 19,
  });

  // Acercar progresivamente conforme bajan las yardas.
  const t = Math.max(0, Math.min(1, (220 - yardsToGreen) / (220 - 25)));
  if (t > 0.08) {
    const extra = Math.min(1.8, t * 1.8);
    map.setZoom(Math.min(20, map.getZoom() + extra), { animate: false });
  }

  // Green arriba (atrás del green), jugador abajo.
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
    rotH,
    topBar,
    bottomBar
  );
}
