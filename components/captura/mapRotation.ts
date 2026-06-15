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
 * Ancla el green SIEMPRE arriba al centro de la pantalla (tras rotar el mapa).
 * El jugador queda automáticamente abajo porque el mapa se rota para que el
 * green apunte hacia arriba. El green es el punto fijo: no se mueve al hacer
 * zoom ni al actualizar la posición.
 */
export function tuneRotatedFraming(
  map: any,
  bearing: number,
  _playerLat: number,
  _playerLon: number,
  greenLat: number,
  greenLon: number,
  viewportW: number,
  viewportH: number,
  _rotW: number,
  _rotH: number,
  topBar = 64,
  _bottomBar = 52
) {
  const targetGreenY = topBar + Math.max(24, viewportH * 0.1);
  const targetCenterX = viewportW / 2;

  for (let i = 0; i < 20; i++) {
    const gs = toRotatedScreen(
      map,
      greenLat,
      greenLon,
      bearing,
      viewportW,
      viewportH
    );
    const errX = targetCenterX - gs.x;
    const errY = targetGreenY - gs.y;
    if (Math.abs(errX) < 1.5 && Math.abs(errY) < 1.5) break;
    panScreenDelta(map, bearing, errX, errY);
  }
}

/**
 * Encuadre estilo Waze, determinista (sin fitBounds, que provocaba saltos y
 * parpadeo). El zoom se calcula a partir de la distancia jugador→green para
 * que el jugador quede a una fracción fija bajo el green; el green se ancla
 * arriba al centro. Como el zoom depende solo de la distancia, la vista es
 * estable (misma posición ⇒ misma vista, sin flashear) y se acerca solo
 * conforme te aproximas al green.
 */
/**
 * Zoom por ESCALONES según el par del hoyo, en función de las yardas al green:
 *   - Par 3 → 2 acercamientos
 *   - Par 4 → 3 acercamientos
 *   - Par 5 → 4 acercamientos
 * El zoom solo cambia al cruzar un umbral de distancia (con histéresis), así la
 * foto no flashea: mientras estás en la misma banda, la escala no se mueve.
 */
const ZOOM_STEP_TABLES: Record<number, Array<{ maxYds: number; zoom: number }>> = {
  // del más lejos (Infinity) al más cerca; gana la banda más cercana cumplida.
  2: [
    { maxYds: Infinity, zoom: 18 },
    { maxYds: 70, zoom: 19.5 },
  ],
  3: [
    { maxYds: Infinity, zoom: 17 },
    { maxYds: 170, zoom: 18.5 },
    { maxYds: 70, zoom: 19.5 },
  ],
  4: [
    { maxYds: Infinity, zoom: 16.5 },
    { maxYds: 320, zoom: 17.5 },
    { maxYds: 170, zoom: 18.5 },
    { maxYds: 70, zoom: 19.5 },
  ],
};

export function zoomStopForPar(par: number, yards: number): number {
  const stops = Math.max(2, Math.min(4, (par || 4) - 1));
  const table = ZOOM_STEP_TABLES[stops] ?? ZOOM_STEP_TABLES[3];
  let zoom = table[0].zoom;
  for (const band of table) {
    if (yards <= band.maxYds) zoom = band.zoom;
  }
  return zoom;
}

export function frameByProximity(
  map: any,
  _L: any,
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
  _extraBounds?: Array<[number, number]>,
  recenter = true,
  par = 4
) {
  // Zoom discreto por par: 2/3/4 escalones según par 3/4/5. Con histéresis de
  // 12 yd en los umbrales para que el GPS no haga rebotar el escalón.
  const currentZoom = map.getZoom();
  const rawZoom = zoomStopForPar(par, yardsToGreen);
  // Aplica histéresis: si el nuevo escalón está "a un paso" del actual y la
  // diferencia es chica, conserva el actual salvo que se cruce con margen.
  const zoomNearMargin = zoomStopForPar(par, yardsToGreen + 12);
  const zoomFarMargin = zoomStopForPar(par, yardsToGreen - 12);
  let qZoom = rawZoom;
  if (
    Math.abs(currentZoom - zoomNearMargin) < 0.01 ||
    Math.abs(currentZoom - zoomFarMargin) < 0.01
  ) {
    qZoom = currentZoom;
  }
  const zoomChanged = Math.abs(currentZoom - qZoom) > 0.01;

  // El zoom (cambio de escala) es lo que recarga TODOS los tiles y provoca el
  // parpadeo, así que solo se aplica cuando cambia el escalón cuantizado o al
  // cambiar de hoyo. El re-anclado del green (abajo) usa paneo, que no
  // recarga el satélite, así que se ejecuta siempre para mantenerlo fijo.
  if (recenter) {
    map.setView([greenLat, greenLon], qZoom, { animate: false });
  } else if (zoomChanged) {
    map.setZoomAround([greenLat, greenLon], qZoom, { animate: false });
  }

  // El green queda fijo arriba al centro; el jugador, abajo.
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
