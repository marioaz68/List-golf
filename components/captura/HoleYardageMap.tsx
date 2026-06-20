"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MapZoomControl } from "@/components/captura/MapZoomControl";
import { bearingDegrees } from "@/lib/distances/ccqGreens";
import {
  type ReferencePointWithYards,
  yardsBetween,
} from "@/lib/distances/ccqHolePoints";
import { centerlineSegmentIndex } from "@/lib/distances/centerline";
import type { LatLon } from "@/lib/distances/holeBoundary";
import type { Polygon } from "@/lib/telegram/ritmo/geometry";
import {
  MAP_SCALE,
  addSatelliteLayers,
  applyManualZoomLevel,
  clampManualZoomDelta,
  frameByProximity,
  isYardageMapSurfaceTap,
  loadLeaflet,
  manualZoomPercent,
  MANUAL_ZOOM_DELTA_MAX,
  MANUAL_ZOOM_DELTA_MIN,
  MANUAL_ZOOM_STEP,
  panToShowInViewport,
  readMapLayout,
  screenToLatLng,
  tuneRotatedFraming,
  uprightHtml,
  zoomToFitWaypoints,
} from "@/components/captura/mapRotation";
import {
  ballMarkerOptions,
  ensureBallMarkerStyles,
  golfBallHtml,
  teeMarkerOptions,
} from "@/components/captura/mapMarkers";

export interface TapPoint {
  lat: number;
  lon: number;
  yards: number;
}

interface HoleYardageMapProps {
  holeNo: number;
  par?: number;
  playerLat: number;
  playerLon: number;
  yardsToCenter: number;
  referencePoints: ReferencePointWithYards[];
  /** Polígono calibrado del hoyo (línea azul de Calibrar). */
  holeBoundary?: Polygon | null;
  /** Línea central de fairway (salida→green) para orientar la foto siguiendo
   *  el fairway en doglegs. Si no hay, se orienta directo al green. */
  centerline?: LatLon[] | null;
  tapPoint?: TapPoint | null;
  /** Punto tocado pendiente de elegir D/G. */
  pendingTapPoint?: { lat: number; lon: number } | null;
  onMapTap?: (lat: number, lon: number) => void;
  /** Origen de la línea de medición (default: posición del jugador). */
  lineFromLat?: number;
  lineFromLon?: number;
  /** Salida marcada por el jugador al iniciar el hoyo. */
  teeMarkPoint?: { lat: number; lon: number } | null;
  /** Si true, el jugador debe marcar salida antes de D/G. */
  needsTeeMark?: boolean;
  /** Salida ya marcada pero aún corregible (sin golpes confirmados). */
  teeAdjustMode?: boolean;
  /** Posiciones fijas donde quedó la bola (golpes ya confirmados). */
  shotLandings?: Array<{ lat: number; lon: number; strokeNo: number }>;
  /** Bola actual: última posición de juego (no GPS al planear golpe). */
  playBallPoint?: { lat: number; lon: number } | null;
  /** Marca suelta tras lago: sin bola azul que tape el mapa. */
  waterDropMode?: boolean;
  /** Tras confirmar basto: sigue el teléfono; conserva zoom manual hasta marcar caída. */
  awaitingLandingMode?: boolean;
  /** Puntos para encuadrar lago + zona de suelta (salida previa y caída en agua). */
  waterDropFocusPoints?: Array<{ lat: number; lon: number }> | null;
  /** Encuadre fijo en la última bola o replay tras OB. */
  mapFramingPoint?: { lat: number; lon: number; segmentIdx: number } | null;
  /** Tee del catálogo (referencia visual al marcar salida). */
  catalogTeePoint?: { lat: number; lon: number } | null;
}

function yardLabel(yards: number): string {
  return `${yards}`;
}

/**
 * Mapa satélite del hoyo con posición del jugador, puntos de referencia
 * y medición al tocar. Rota el mapa para que el green quede arriba y el
 * jugador abajo, sin importar la orientación del hoyo.
 */
export function HoleYardageMap({
  holeNo,
  par = 4,
  playerLat,
  playerLon,
  yardsToCenter,
  referencePoints,
  holeBoundary = null,
  centerline = null,
  tapPoint,
  pendingTapPoint = null,
  onMapTap,
  lineFromLat,
  lineFromLon,
  teeMarkPoint = null,
  needsTeeMark = false,
  teeAdjustMode = false,
  shotLandings = [],
  playBallPoint = null,
  waterDropMode = false,
  awaitingLandingMode = false,
  waterDropFocusPoints = null,
  mapFramingPoint = null,
  catalogTeePoint = null,
}: HoleYardageMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const bearingRef = useRef(0);
  // Último hoyo encuadrado: al cambiar de hoyo recolocamos la vista; en
  // actualizaciones de posición no, para no recargar tiles (evita parpadeo).
  const framedHoleRef = useRef<number | null>(null);
  const framedSegmentRef = useRef<number>(0);
  const framedPosRef = useRef<string>("");
  const autoZoomRef = useRef(17);
  const userZoomDeltaRef = useRef(0);
  const framingAnchorRef = useRef<{ lat: number; lon: number } | null>(null);
  const onMapTapRef = useRef(onMapTap);
  const awaitingLandingModeRef = useRef(awaitingLandingMode);
  const waterDropModeRef = useRef(waterDropMode);
  const lastTouchEndAtRef = useRef(0);
  const sizeRef = useRef({ w: 0, h: 0 });
  const playerPosRef = useRef({ lat: playerLat, lon: playerLon });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mapReady, setMapReady] = useState(false);
  const [zoomPercent, setZoomPercent] = useState(100);
  onMapTapRef.current = onMapTap;
  awaitingLandingModeRef.current = awaitingLandingMode;
  waterDropModeRef.current = waterDropMode;
  sizeRef.current = size;
  playerPosRef.current = { lat: playerLat, lon: playerLon };

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Init map once al montar. El contenedor del mapa tiene tamaño por CSS
  // (155% del viewport), así que no esperamos a medir con JS: crearlo de una
  // evita el caso en que el satélite quedaba en blanco.
  useEffect(() => {
    if (!mapDivRef.current) return;
    if (mapRef.current) return;
    let cleanup = () => {};
    let cancelled = false;

    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !mapDivRef.current) return;
      const map = L.map(mapDivRef.current, {
        center:
          needsTeeMark && catalogTeePoint
            ? [catalogTeePoint.lat, catalogTeePoint.lon]
            : [playerPosRef.current.lat, playerPosRef.current.lon],
        zoom: 17,
        maxZoom: 21,
        // zoomSnap 0 = zoom fraccional continuo: el acercamiento al green
        // es gradual y "más seguido", no en saltos de nivel entero.
        zoomSnap: 0,
        zoomControl: false,
        // Mapa fijo: el encuadre lo controla la app (green arriba al centro).
        // No se puede mover con los dedos para que no se desalinee.
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      addSatelliteLayers(map, L);

      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);

      const fireTap = (() => {
        let lastAt = 0;
        return (lat: number, lon: number) => {
          const now = Date.now();
          if (now - lastAt < 400) return;
          lastAt = now;
          onMapTapRef.current?.(lat, lon);
        };
      })();

      const onTap = (e: MouseEvent | TouchEvent) => {
        if (!onMapTapRef.current || !mapRef.current) return;
        if (!isYardageMapSurfaceTap(e.target)) return;
        const isTouch = e.type === "touchend";
        if (!isTouch && Date.now() - lastTouchEndAtRef.current < 500) {
          return;
        }
        if (isTouch) {
          e.preventDefault();
          lastTouchEndAtRef.current = Date.now();
        }
        const clientX =
          "changedTouches" in e && e.changedTouches.length > 0
            ? e.changedTouches[0].clientX
            : (e as MouseEvent).clientX;
        const clientY =
          "changedTouches" in e && e.changedTouches.length > 0
            ? e.changedTouches[0].clientY
            : (e as MouseEvent).clientY;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const latlng = screenToLatLng(
          clientX,
          clientY,
          rect,
          bearingRef.current,
          mapRef.current,
          L
        );
        fireTap(latlng.lat, latlng.lng);
      };

      const container = containerRef.current;
      container?.addEventListener("touchend", onTap, { passive: false, capture: true });
      container?.addEventListener("click", onTap, { capture: true });

      map.invalidateSize();
      setMapReady(true);

      cleanup = () => {
        cancelled = true;
        container?.removeEventListener("touchend", onTap, { capture: true });
        container?.removeEventListener("click", onTap, { capture: true });
        mapRef.current = null;
        layersRef.current = null;
        setMapReady(false);
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
    // Solo al montar. La posición del jugador se actualiza en el efecto de
    // markers; recrear el mapa en cada GPS rompía la rotación/encuadre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // invalidateSize diferido tras crear el mapa
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    map.invalidateSize();
    requestAnimationFrame(() => map.invalidateSize());
    const t = window.setTimeout(() => map.invalidateSize(), 250);
    return () => window.clearTimeout(t);
  }, [mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || size.w === 0 || size.h === 0) return;
    map.invalidateSize();
  }, [size.w, size.h]);

  const applyUserZoom = useCallback(() => {
    const map = mapRef.current;
    const anchor = framingAnchorRef.current;
    const { viewportW, viewportH, rotW, rotH } = readMapLayout(
      containerRef.current,
      mapDivRef.current
    );
    if (!map || !anchor || viewportW === 0 || viewportH === 0) return;
    if (awaitingLandingModeRef.current || waterDropModeRef.current) {
      map.setZoom(
        Math.max(
          15,
          Math.min(
            21,
            autoZoomRef.current + userZoomDeltaRef.current
          )
        ),
        { animate: false }
      );
      return;
    }
    applyManualZoomLevel(
      map,
      bearingRef.current,
      anchor.lat,
      anchor.lon,
      autoZoomRef.current,
      userZoomDeltaRef.current,
      viewportW,
      viewportH,
      rotW,
      rotH
    );
  }, []);

  const bumpZoom = useCallback(
    (direction: 1 | -1) => {
      const next = clampManualZoomDelta(
        userZoomDeltaRef.current + direction * MANUAL_ZOOM_STEP
      );
      userZoomDeltaRef.current = next;
      setZoomPercent(manualZoomPercent(next));
      applyUserZoom();
    },
    [applyUserZoom]
  );

  useEffect(() => {
    userZoomDeltaRef.current = 0;
    setZoomPercent(100);
    framedHoleRef.current = -1;
    framedSegmentRef.current = -1;
    framedPosRef.current = "";
  }, [holeNo]);

  // Update markers, rotation, zoom when data changes
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layersRef.current;
    const rotator = rotatorRef.current;
    const { viewportW, viewportH, rotW, rotH } = readMapLayout(
      containerRef.current,
      mapDivRef.current
    );
    if (
      !map ||
      !layerGroup ||
      !rotator ||
      !mapReady ||
      viewportW === 0 ||
      viewportH === 0
    )
      return;

    (async () => {
      const L = await loadLeaflet();
      ensureBallMarkerStyles();
      layerGroup.clearLayers();

      const greenCenter = referencePoints.find((p) => p.kind === "green-center");
      const greenFront = referencePoints.find((p) => p.kind === "green-front");
      const greenBack = referencePoints.find((p) => p.kind === "green-back");
      const greenTarget = greenCenter ?? greenFront ?? greenBack;

      const player = { lat: playerLat, lon: playerLon };
      const lastLanding =
        shotLandings.length > 0
          ? shotLandings[shotLandings.length - 1]
          : null;
      /** Posición de juego para encuadre: siempre la última bola, nunca GPS salvo fallback. */
      const framingPos =
        mapFramingPoint ??
        (needsTeeMark && catalogTeePoint
          ? catalogTeePoint
          : playBallPoint ?? lastLanding ?? teeMarkPoint ?? catalogTeePoint ?? player);
      const hasCenterline = Boolean(centerline && centerline.length >= 2);
      const segIdx =
        mapFramingPoint != null && hasCenterline
          ? mapFramingPoint.segmentIdx
          : hasCenterline
            ? centerlineSegmentIndex(framingPos, centerline!)
            : 0;
      const totalSegs = hasCenterline ? centerline!.length - 1 : 1;
      // Punto actual (de dónde vienes en este tramo) y el ÚLTIMO punto de la
      // línea (= "after"/atrás del green). La foto va del punto actual al green.
      const fromWp = hasCenterline ? centerline![segIdx] : null;
      const lastWp = hasCenterline
        ? centerline![centerline!.length - 1]
        : null;

      // Anclaje superior: último punto de la línea (= after / atrás del green).
      const greenBackPt = referencePoints.find((p) => p.kind === "green-back");
      const topAnchor =
        lastWp ??
        (greenBackPt
          ? { lat: greenBackPt.lat, lon: greenBackPt.lon }
          : null) ??
        greenTarget;
      const anchor = topAnchor;

      // Zoom: que quepan TODOS los puntos restantes (del actual al green), así
      // al avanzar de punto la foto se va acercando hacia el green.
      const remainingWps =
        hasCenterline && fromWp ? centerline!.slice(segIdx) : null;

      // Orientación estable por tramo: usamos el punto actual (fijo) → green
      // como eje, no el jugador (que se mueve), para que la foto no gire ni
      // reescale mientras caminas dentro del mismo tramo.
      const orientFrom = fromWp ?? framingPos;
      const bearing = topAnchor
        ? bearingDegrees(orientFrom.lat, orientFrom.lon, topAnchor.lat, topAnchor.lon)
        : 0;
      bearingRef.current = bearing;
      rotator.style.transform = `rotate(${-bearing}deg)`;

      // Píxeles disponibles (mismos márgenes que el encuadre: top 56, bottom 104).
      const topBarPx = 56;
      const bottomBarPx = 104;
      const targetTopY = topBarPx + Math.max(24, viewportH * 0.1);
      const availH = Math.max(80, (viewportH - bottomBarPx - targetTopY) * 0.96);
      const availW = Math.max(80, viewportW * 0.88);
      const manualZoomActive = userZoomDeltaRef.current !== 0;
      const freezeMapView = waterDropMode;
      const landingMarkMode = awaitingLandingMode;
      const preserveManualZoom =
        manualZoomActive && (waterDropMode || landingMarkMode);
      const applyStoredZoom = () => {
        map.setZoom(
          Math.max(
            15,
            Math.min(21, autoZoomRef.current + userZoomDeltaRef.current)
          ),
          { animate: false }
        );
      };
      const fitZoom =
        waterDropMode &&
        waterDropFocusPoints &&
        waterDropFocusPoints.length >= 2
          ? zoomToFitWaypoints(
              waterDropFocusPoints,
              bearing,
              availW,
              availH
            )
          : remainingWps && remainingWps.length >= 2
            ? zoomToFitWaypoints(remainingWps, bearing, availW, availH)
            : null;
      const zoomAnchor =
        freezeMapView || landingMarkMode
          ? { lat: framingPos.lat, lon: framingPos.lon }
          : anchor;

      // Vista limpia: sin línea azul del hoyo ni líneas/etiquetas de obstáculos.
      // De los puntos del green solo mostramos el número de yardas en chiquito
      // (sin el punto/dot), en entrada/centro/atrás.
      const GREEN_KINDS = ["green-front", "green-center", "green-back"];
      for (const p of referencePoints) {
        if (!GREEN_KINDS.includes(p.kind)) continue;
        const isCenter = p.kind === "green-center";
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="color:#fff;font-size:${isCenter ? 12 : 10}px;font-weight:800;font-family:Arial,sans-serif;text-shadow:0 1px 3px rgba(0,0,0,0.95),0 0 2px rgba(0,0,0,0.95);">${yardLabel(p.yards)}</div>`,
              bearing
            ),
            iconSize: [30, 14],
            iconAnchor: [15, 7],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      if (tapPoint) {
        const fromLat = lineFromLat ?? playerLat;
        const fromLon = lineFromLon ?? playerLon;
        L.polyline(
          [
            [fromLat, fromLon],
            [tapPoint.lat, tapPoint.lon],
          ],
          { color: "#f472b6", weight: 2.5, opacity: 0.9 }
        ).addTo(layerGroup);

        const midLat = (fromLat + tapPoint.lat) / 2;
        const midLon = (fromLon + tapPoint.lon) / 2;
        L.marker([midLat, midLon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="background:#db2777;color:#fff;padding:2px 7px;border-radius:8px;font-size:12px;font-weight:800;font-family:Arial,sans-serif;">${yardLabel(tapPoint.yards)} yds</div>`,
              bearing
            ),
            iconSize: [48, 20],
            iconAnchor: [24, 10],
          }),
          interactive: false,
        }).addTo(layerGroup);

        L.marker(
          [tapPoint.lat, tapPoint.lon],
          ballMarkerOptions(L, golfBallHtml(9, "#ec4899"), 9)
        ).addTo(layerGroup);
      }

      if (pendingTapPoint && !tapPoint) {
        L.marker(
          [pendingTapPoint.lat, pendingTapPoint.lon],
          ballMarkerOptions(L, golfBallHtml(9, "#a855f7"), 9)
        ).addTo(layerGroup);
      }

      // Marcadores fijos del hoyo: salida + cada golpe confirmado (no se quitan).
      if ((needsTeeMark || teeAdjustMode) && catalogTeePoint) {
        L.marker([catalogTeePoint.lat, catalogTeePoint.lon], {
          icon: L.divIcon({
            className: "yardage-ball-marker",
            html: `<div style="width:14px;height:14px;border-radius:50%;border:2px dashed rgba(52,211,153,0.95);background:rgba(16,185,129,0.25);box-shadow:0 0 0 3px rgba(0,0,0,0.35);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          interactive: false,
          zIndexOffset: 580,
        }).addTo(layerGroup);
      }

      if (teeMarkPoint) {
        L.marker(
          [teeMarkPoint.lat, teeMarkPoint.lon],
          teeMarkerOptions(L, 9)
        ).addTo(layerGroup);
      }

      for (const land of shotLandings) {
        L.marker(
          [land.lat, land.lon],
          {
            ...ballMarkerOptions(L, golfBallHtml(8, "#f59e0b"), 8),
            zIndexOffset: 620 + land.strokeNo,
          }
        ).addTo(layerGroup);
      }

      if (playBallPoint && !waterDropMode) {
        L.marker(
          [playBallPoint.lat, playBallPoint.lon],
          {
            ...ballMarkerOptions(L, golfBallHtml(9, "#3b82f6"), 9),
            zIndexOffset: 900,
          }
        ).addTo(layerGroup);
      }

      const showPhoneDot =
        !needsTeeMark &&
        !waterDropMode &&
        (!playBallPoint ||
          Math.abs(playBallPoint.lat - playerLat) > 0.00002 ||
          Math.abs(playBallPoint.lon - playerLon) > 0.00002);

      if (showPhoneDot) {
        L.marker([playerLat, playerLon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="position:relative;width:20px;height:20px;">
            <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.25);animation:yardage-pulse 1.8s ease-out infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>
          </div>`,
              bearing
            ),
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          }),
          interactive: false,
          zIndexOffset: 1000,
        }).addTo(layerGroup);
      }

      if (!document.querySelector("style[data-yardage-pulse]")) {
        const style = document.createElement("style");
        style.setAttribute("data-yardage-pulse", "1");
        style.textContent = `@keyframes yardage-pulse { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(2.2);opacity:0} }`;
        document.head.appendChild(style);
      }

      const userPin = tapPoint ?? pendingTapPoint;

      try {
        if (anchor) {
          const recenterHole = framedHoleRef.current !== holeNo;
          const recenterSeg = framedSegmentRef.current !== segIdx;
          const posKey = `${Math.round(framingPos.lat * 1e5)}:${Math.round(
            framingPos.lon * 1e5
          )}`;
          const recenterPos = framedPosRef.current !== posKey;
          framedHoleRef.current = holeNo;
          framedSegmentRef.current = segIdx;
          framedPosRef.current = posKey;
          const shouldReframe =
            recenterHole || (!userPin && (recenterSeg || recenterPos));
          if (shouldReframe && !(landingMarkMode && manualZoomActive)) {
            frameByProximity(
              map,
              L,
              bearing,
              framingPos.lat,
              framingPos.lon,
              anchor.lat,
              anchor.lon,
              yardsBetween(
                framingPos.lat,
                framingPos.lon,
                anchor.lat,
                anchor.lon
              ),
              viewportW,
              viewportH,
              rotW,
              rotH,
              56,
              104,
              undefined,
              true,
              par,
              hasCenterline ? { idx: segIdx, total: totalSegs } : null,
              null,
              fitZoom
            );
            autoZoomRef.current = map.getZoom();
            framingAnchorRef.current = zoomAnchor;
            if (recenterHole || recenterPos) {
              if (!(landingMarkMode && manualZoomActive)) {
                userZoomDeltaRef.current = 0;
                setZoomPercent(100);
              }
            } else if (manualZoomActive && !landingMarkMode) {
              applyManualZoomLevel(
                map,
                bearing,
                zoomAnchor.lat,
                zoomAnchor.lon,
                autoZoomRef.current,
                userZoomDeltaRef.current,
                viewportW,
                viewportH,
                rotW,
                rotH
              );
            }
          } else if (shouldReframe && landingMarkMode && manualZoomActive) {
            framingAnchorRef.current = zoomAnchor;
            applyStoredZoom();
          } else if (userPin) {
            if (!freezeMapView) {
              panToShowInViewport(
                map,
                bearing,
                userPin.lat,
                userPin.lon,
                viewportW,
                viewportH
              );
            }
            if (preserveManualZoom) {
              applyStoredZoom();
            } else if (!landingMarkMode && manualZoomActive) {
              applyManualZoomLevel(
                map,
                bearing,
                zoomAnchor.lat,
                zoomAnchor.lon,
                autoZoomRef.current,
                userZoomDeltaRef.current,
                viewportW,
                viewportH,
                rotW,
                rotH
              );
            } else if (!landingMarkMode) {
              tuneRotatedFraming(
                map,
                bearing,
                framingPos.lat,
                framingPos.lon,
                anchor.lat,
                anchor.lon,
                viewportW,
                viewportH,
                rotW,
                rotH,
                56,
                104
              );
            }
          } else {
            // GPS / demo / bola: re-anclar green arriba sin recalcular zoom.
            if (preserveManualZoom) {
              applyStoredZoom();
            } else if (freezeMapView) {
              /* Suelta de lago: vista fija hasta marcar drop. */
            } else if (landingMarkMode) {
              /* Caída pendiente: zoom solo vía frameByProximity; vista estable para tocar. */
            } else if (manualZoomActive) {
              applyManualZoomLevel(
                map,
                bearing,
                zoomAnchor.lat,
                zoomAnchor.lon,
                autoZoomRef.current,
                userZoomDeltaRef.current,
                viewportW,
                viewportH,
                rotW,
                rotH
              );
            } else {
              tuneRotatedFraming(
                map,
                bearing,
                framingPos.lat,
                framingPos.lon,
                anchor.lat,
                anchor.lon,
                viewportW,
                viewportH,
                rotW,
                rotH,
                56,
                104
              );
            }
          }
          if (!shouldReframe && zoomAnchor) {
            framingAnchorRef.current = zoomAnchor;
            if (autoZoomRef.current <= 0) {
              autoZoomRef.current = map.getZoom();
            }
          }
        }
      } catch {
        /* mantener vista actual */
      }
    })();
  }, [
    holeNo,
    par,
    holeBoundary,
    centerline,
    playerLat,
    playerLon,
    yardsToCenter,
    referencePoints,
    tapPoint,
    pendingTapPoint,
    lineFromLat,
    lineFromLon,
    teeMarkPoint,
    shotLandings,
    playBallPoint,
    waterDropMode,
    awaitingLandingMode,
    waterDropFocusPoints,
    mapFramingPoint,
    catalogTeePoint,
    needsTeeMark,
    teeAdjustMode,
    size.w,
    size.h,
    mapReady,
  ]);

  // Contenedor del mapa más grande que el viewport (para cubrir las esquinas
  // al rotar), dimensionado por CSS para que siempre tenga tamaño real.
  const sizePct = MAP_SCALE * 100;
  const offsetPct = ((MAP_SCALE - 1) / 2) * 100;

  return (
      <div
        ref={containerRef}
        className="relative h-full w-full touch-manipulation overflow-hidden bg-black"
      >
      <div
        ref={rotatorRef}
        className="absolute"
        style={{
          left: `-${offsetPct}%`,
          top: `-${offsetPct}%`,
          width: `${sizePct}%`,
          height: `${sizePct}%`,
          transformOrigin: "center center",
        }}
      >
        <div
          ref={mapDivRef}
          data-yardage-map-surface
          className="absolute inset-0"
        />
      </div>
      <div
        data-yardage-map-ui
        className="pointer-events-none absolute left-2 top-14 z-[1010] max-w-[11rem] rounded-md bg-black/70 px-2 py-1 text-[9px] leading-tight text-slate-300"
      >
        {needsTeeMark
          ? "Paso 1 · toca el tee en el mapa"
          : teeAdjustMode
            ? "Toca el tee en el mapa para corregir la salida"
            : "Toca el mapa · D distancia · G golpe"}
      </div>
      {mapReady ? (
        <MapZoomControl
          percent={zoomPercent}
          onZoomIn={() => bumpZoom(1)}
          onZoomOut={() => bumpZoom(-1)}
          canZoomIn={
            userZoomDeltaRef.current <
            MANUAL_ZOOM_DELTA_MAX - MANUAL_ZOOM_STEP * 0.5
          }
          canZoomOut={
            userZoomDeltaRef.current >
            MANUAL_ZOOM_DELTA_MIN + MANUAL_ZOOM_STEP * 0.5
          }
        />
      ) : null}
    </div>
  );
}
