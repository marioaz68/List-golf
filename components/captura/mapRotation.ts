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

/**
 * Convierte un toque en pantalla a lat/lon considerando la rotación CSS del
 * mapa. Leaflet no conoce esa rotación: NUNCA uses map.mouseEventToLatLng ni
 * map.on("click") en mapas rotados; solo esta función vía el contenedor visible.
 */
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

/** Paneo suave (sin cambiar zoom) para que un punto quede en el viewport rotado. */
export function panToShowInViewport(
  map: any,
  bearing: number,
  lat: number,
  lon: number,
  viewportW: number,
  viewportH: number,
  marginPx = 48
) {
  const targetX = viewportW / 2;
  const targetY = viewportH / 2;
  const pt = toRotatedScreen(map, lat, lon, bearing, viewportW, viewportH);
  const minX = marginPx;
  const maxX = viewportW - marginPx;
  const minY = marginPx + 40;
  const maxY = viewportH - marginPx - 80;
  let dx = 0;
  let dy = 0;
  if (pt.x < minX) dx = pt.x - minX;
  else if (pt.x > maxX) dx = pt.x - maxX;
  if (pt.y < minY) dy = pt.y - minY;
  else if (pt.y > maxY) dy = pt.y - maxY;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    panScreenDelta(map, bearing, dx, dy);
  }
}

/** Paso de zoom manual (+/−) en niveles Leaflet. */
export const MANUAL_ZOOM_STEP = 0.4;
export const MANUAL_ZOOM_DELTA_MIN = -1.2;
export const MANUAL_ZOOM_DELTA_MAX = 2.2;

export function manualZoomPercent(delta: number): number {
  return Math.round(100 * 2 ** delta);
}

export function clampManualZoomDelta(delta: number): number {
  return Math.max(
    MANUAL_ZOOM_DELTA_MIN,
    Math.min(MANUAL_ZOOM_DELTA_MAX, delta)
  );
}

/** Aplica zoom manual manteniendo el ancla (green/after) fijo arriba al centro. */
export function applyManualZoomLevel(
  map: any,
  bearing: number,
  anchorLat: number,
  anchorLon: number,
  autoZoom: number,
  delta: number,
  viewportW: number,
  viewportH: number,
  rotW: number,
  rotH: number,
  minZoom = 15,
  maxZoom = 21,
  topBar = 56,
  bottomBar = 104
): number {
  const z = Math.max(minZoom, Math.min(maxZoom, autoZoom + delta));
  tuneRotatedFraming(
    map,
    bearing,
    0,
    0,
    anchorLat,
    anchorLon,
    viewportW,
    viewportH,
    rotW,
    rotH,
    topBar,
    bottomBar
  );
  map.setZoomAround([anchorLat, anchorLon], z, { animate: false });
  for (let pass = 0; pass < 3; pass++) {
    tuneRotatedFraming(
      map,
      bearing,
      0,
      0,
      anchorLat,
      anchorLon,
      viewportW,
      viewportH,
      rotW,
      rotH,
      topBar,
      bottomBar
    );
    map.setZoomAround([anchorLat, anchorLon], map.getZoom(), { animate: false });
  }
  return z;
}

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

/** Zoom discreto por TRAMO de la línea central (par3→2, par4→3, par5→4 escalones).
 *  segmentIdx va de 0 (salida) a totalSegments-1 (último tramo hacia el green). */
const SEGMENT_ZOOM: Record<number, number[]> = {
  2: [17.5, 19.5],
  3: [16.5, 18, 19.5],
  4: [16, 17.5, 18.5, 19.5],
};

export function zoomStopForCenterlineSegment(
  par: number,
  segmentIdx: number,
  totalSegments: number
): number {
  const stops = Math.max(2, Math.min(4, (par || 4) - 1));
  const table = SEGMENT_ZOOM[stops] ?? SEGMENT_ZOOM[3];
  if (totalSegments <= 1) return table[0];
  const t = Math.max(0, Math.min(1, segmentIdx / (totalSegments - 1)));
  const step = Math.min(table.length - 1, Math.round(t * (table.length - 1)));
  return table[step];
}

/**
 * Zoom Leaflet para que `meters` (largo del tramo en el suelo) ocupe
 * `targetPixels` de alto en pantalla. Así la foto del tramo actual llena el
 * espacio disponible (más grande en tablet, ajustada en teléfono). Se cuantiza
 * a 0.5 para estabilidad: como el tramo es fijo, el zoom resultante es fijo y
 * no flashea mientras estás en ese tramo.
 */
export function zoomToFitMeters(
  meters: number,
  lat: number,
  targetPixels: number
): number {
  if (meters <= 0 || targetPixels <= 0) return 18;
  // metros por pixel a zoom 0 (proyección Web Mercator) a esta latitud.
  const mppZ0 = 156543.03392 * Math.cos((lat * Math.PI) / 180);
  const mppNeeded = meters / targetPixels;
  const z = Math.log2(mppZ0 / mppNeeded);
  const quantized = Math.round(z * 2) / 2;
  return Math.max(15, Math.min(20.5, quantized));
}

/**
 * Zoom para que TODOS los puntos dados (del punto actual al green) quepan en
 * pantalla, considerando la rotación (eje "hacia el green" = vertical). Mide la
 * extensión a lo largo (vertical) y a lo ancho (horizontal, p. ej. doglegs) y
 * elige el zoom que satisface ambas. El primer punto se usa como referencia.
 */
export function zoomToFitWaypoints(
  pts: Array<{ lat: number; lon: number }>,
  bearingDeg: number,
  availW: number,
  availH: number
): number {
  if (pts.length < 2) return 18;
  const bRad = (bearingDeg * Math.PI) / 180;
  const M_PER_DEG_LAT = 110_574;
  const ref = pts[0];
  const mPerDegLon = 111_320 * Math.cos((ref.lat * Math.PI) / 180);
  let minAlong = Infinity;
  let maxAlong = -Infinity;
  let minCross = Infinity;
  let maxCross = -Infinity;
  for (const p of pts) {
    const east = (p.lon - ref.lon) * mPerDegLon;
    const north = (p.lat - ref.lat) * M_PER_DEG_LAT;
    const along = east * Math.sin(bRad) + north * Math.cos(bRad);
    const cross = east * Math.cos(bRad) - north * Math.sin(bRad);
    if (along < minAlong) minAlong = along;
    if (along > maxAlong) maxAlong = along;
    if (cross < minCross) minCross = cross;
    if (cross > maxCross) maxCross = cross;
  }
  const vMeters = Math.max(1, maxAlong - minAlong);
  const hMeters = Math.max(1, maxCross - minCross);
  const zV = zoomToFitMeters(vMeters, ref.lat, availH);
  const zH = zoomToFitMeters(hMeters, ref.lat, availW);
  return Math.min(zV, zH);
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
  par = 4,
  /** Si se pasa, el zoom sigue el tramo de la línea central (no yardas al green). */
  centerlineSegment?: { idx: number; total: number } | null,
  /** Largo (m) del tramo actual: si se pasa, el zoom ajusta ese tramo para que
   *  llene el alto disponible (la foto no sale chica). Prioritario sobre los
   *  escalones por par. */
  fitSegmentMeters?: number | null,
  /** Zoom ya calculado (p. ej. para que quepa del punto actual al green). Si se
   *  pasa, manda sobre cualquier otro cálculo. */
  explicitZoom?: number | null
) {
  const currentZoom = map.getZoom();
  // Alto disponible en pantalla para el tramo (entre el ancla arriba y los
  // controles/ritmo abajo). Reservamos un margen para que respire.
  const targetTopY = topBar + Math.max(24, viewportH * 0.1);
  const availablePx = Math.max(80, (viewportH - bottomBar - targetTopY) * 0.96);
  const rawZoom =
    explicitZoom && explicitZoom > 0
      ? explicitZoom
      : fitSegmentMeters && fitSegmentMeters > 0
        ? zoomToFitMeters(fitSegmentMeters, greenLat, availablePx)
        : centerlineSegment
          ? zoomStopForCenterlineSegment(
              par,
              centerlineSegment.idx,
              centerlineSegment.total
            )
          : zoomStopForPar(par, yardsToGreen);
  // Con tramo fijo (centerline, fit por metros o zoom explícito) el zoom es
  // determinista, así que no necesita histéresis por yardas.
  const stableSegment =
    Boolean(centerlineSegment) ||
    Boolean(fitSegmentMeters) ||
    Boolean(explicitZoom);
  const zoomNearMargin = stableSegment
    ? rawZoom
    : zoomStopForPar(par, yardsToGreen + 12);
  const zoomFarMargin = stableSegment
    ? rawZoom
    : zoomStopForPar(par, yardsToGreen - 12);
  let qZoom = rawZoom;
  if (
    Math.abs(currentZoom - zoomNearMargin) < 0.01 ||
    Math.abs(currentZoom - zoomFarMargin) < 0.01
  ) {
    qZoom = currentZoom;
  }
  const zoomChanged = Math.abs(currentZoom - qZoom) > 0.01;

  // Zoom anclado al green para que no se desplace al cambiar escala o de hoyo.
  if (recenter || zoomChanged) {
    map.setZoomAround([greenLat, greenLon], qZoom, { animate: false });
  }

  // El green queda fijo arriba al centro; el jugador, abajo.
  for (let pass = 0; pass < (recenter || zoomChanged ? 3 : 1); pass++) {
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
    if (zoomChanged || recenter) {
      map.setZoomAround([greenLat, greenLon], map.getZoom(), { animate: false });
    }
  }
}
