"use client";

import { useEffect, useRef, useState } from "react";
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
  frameByProximity,
  loadLeaflet,
  readMapLayout,
  screenToLatLng,
  tuneRotatedFraming,
  uprightHtml,
  zoomToFitWaypoints,
} from "@/components/captura/mapRotation";

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
  /** Última bola confirmada en el hoyo. */
  lastBallPoint?: { lat: number; lon: number } | null;
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
  lastBallPoint = null,
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
  const onMapTapRef = useRef(onMapTap);
  const sizeRef = useRef({ w: 0, h: 0 });
  const playerPosRef = useRef({ lat: playerLat, lon: playerLon });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mapReady, setMapReady] = useState(false);
  onMapTapRef.current = onMapTap;
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
        center: [playerPosRef.current.lat, playerPosRef.current.lon],
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
          if (now - lastAt < 350) return;
          lastAt = now;
          onMapTapRef.current?.(lat, lon);
        };
      })();

      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        fireTap(e.latlng.lat, e.latlng.lng);
      });

      const onTap = (e: MouseEvent | TouchEvent) => {
        if (!onMapTapRef.current || !mapRef.current) return;
        e.preventDefault();
        const clientX =
          "touches" in e ? e.changedTouches[0].clientX : e.clientX;
        const clientY =
          "touches" in e ? e.changedTouches[0].clientY : e.clientY;
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
      container?.addEventListener("touchend", onTap, { passive: false });
      container?.addEventListener("click", onTap);

      map.invalidateSize();
      setMapReady(true);

      cleanup = () => {
        cancelled = true;
        map.off("click");
        container?.removeEventListener("touchend", onTap);
        container?.removeEventListener("click", onTap);
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
      layerGroup.clearLayers();

      const greenCenter = referencePoints.find((p) => p.kind === "green-center");
      const greenFront = referencePoints.find((p) => p.kind === "green-front");
      const greenBack = referencePoints.find((p) => p.kind === "green-back");
      const greenTarget = greenCenter ?? greenFront ?? greenBack;

      const player = { lat: playerLat, lon: playerLon };
      const hasCenterline = Boolean(centerline && centerline.length >= 2);
      const segIdx = hasCenterline
        ? centerlineSegmentIndex(player, centerline!)
        : 0;
      const totalSegs = hasCenterline ? centerline!.length - 1 : 1;
      // Punto actual (de dónde vienes en este tramo) y el ÚLTIMO punto de la
      // línea (= "after"/atrás del green). La foto va del punto actual al green.
      const fromWp = hasCenterline ? centerline![segIdx] : null;
      const lastWp = hasCenterline
        ? centerline![centerline!.length - 1]
        : null;

      // Anclaje/orientación: el green (último punto) arriba; el jugador, abajo.
      const aim = lastWp ?? greenTarget ?? null;
      const anchor = aim ?? greenTarget;
      const yardsToAnchor =
        anchor != null
          ? yardsBetween(playerLat, playerLon, anchor.lat, anchor.lon)
          : yardsToCenter;

      // Zoom: que quepan TODOS los puntos restantes (del actual al green), así
      // al avanzar de punto la foto se va acercando hacia el green.
      const remainingWps =
        hasCenterline && fromWp ? centerline!.slice(segIdx) : null;

      // Orientación estable por tramo: usamos el punto actual (fijo) → green
      // como eje, no el jugador (que se mueve), para que la foto no gire ni
      // reescale mientras caminas dentro del mismo tramo.
      const orientFrom = fromWp ?? { lat: playerLat, lon: playerLon };
      const bearing = aim
        ? bearingDegrees(orientFrom.lat, orientFrom.lon, aim.lat, aim.lon)
        : 0;
      bearingRef.current = bearing;
      rotator.style.transform = `rotate(${-bearing}deg)`;

      // Píxeles disponibles (mismos márgenes que el encuadre: top 56, bottom 104).
      const topBarPx = 56;
      const bottomBarPx = 104;
      const targetTopY = topBarPx + Math.max(24, viewportH * 0.1);
      const availH = Math.max(80, (viewportH - bottomBarPx - targetTopY) * 0.96);
      const availW = Math.max(80, viewportW * 0.88);
      const fitZoom =
        remainingWps && remainingWps.length >= 2
          ? zoomToFitWaypoints(remainingWps, bearing, availW, availH)
          : null;

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

        L.marker([tapPoint.lat, tapPoint.lon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="width:14px;height:14px;border-radius:50%;background:#ec4899;border:2px solid #fff;box-shadow:0 0 0 3px rgba(236,72,153,0.4);"></div>`,
              bearing
            ),
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      if (pendingTapPoint && !tapPoint) {
        L.marker([pendingTapPoint.lat, pendingTapPoint.lon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="width:16px;height:16px;border-radius:50%;background:#a855f7;border:2px solid #fff;box-shadow:0 0 0 4px rgba(168,85,247,0.45);"></div>`,
              bearing
            ),
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      if (lastBallPoint) {
        L.marker([lastBallPoint.lat, lastBallPoint.lon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="width:12px;height:12px;border-radius:50%;background:#f59e0b;border:2px solid #fff;box-shadow:0 0 0 2px rgba(245,158,11,0.45);"></div>`,
              bearing
            ),
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

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

      if (!document.querySelector("style[data-yardage-pulse]")) {
        const style = document.createElement("style");
        style.setAttribute("data-yardage-pulse", "1");
        style.textContent = `@keyframes yardage-pulse { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(2.2);opacity:0} }`;
        document.head.appendChild(style);
      }

      const bounds = L.latLngBounds([
        [playerLat, playerLon],
        ...referencePoints
          .filter((p) =>
            ["green-front", "green-center", "green-back"].includes(p.kind)
          )
          .map((p) => [p.lat, p.lon] as [number, number]),
      ]);
      if (tapPoint) bounds.extend([tapPoint.lat, tapPoint.lon]);

      try {
        if (anchor && !tapPoint) {
          const recenterHole = framedHoleRef.current !== holeNo;
          const recenterSeg = framedSegmentRef.current !== segIdx;
          framedHoleRef.current = holeNo;
          framedSegmentRef.current = segIdx;
          frameByProximity(
            map,
            L,
            bearing,
            playerLat,
            playerLon,
            anchor.lat,
            anchor.lon,
            yardsToAnchor,
            viewportW,
            viewportH,
            rotW,
            rotH,
            56,
            104,
            undefined,
            recenterHole || recenterSeg,
            par,
            hasCenterline ? { idx: segIdx, total: totalSegs } : null,
            null,
            fitZoom
          );
        } else {
          map.fitBounds(bounds, {
            paddingTopLeft: [16, 68],
            paddingBottomRight: [16, 52],
            animate: false,
            maxZoom: 20,
          });
          if (anchor) {
            tuneRotatedFraming(
              map,
              bearing,
              playerLat,
              playerLon,
              anchor.lat,
              anchor.lon,
              viewportW,
              viewportH,
              rotW,
              rotH
            );
          }
        }
      } catch {
        map.fitBounds(bounds, { padding: [40, 40], animate: false, maxZoom: 19 });
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
    lastBallPoint,
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
        <div ref={mapDivRef} className="absolute inset-0" />
      </div>
      <div className="pointer-events-none absolute bottom-9 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] text-slate-300">
        Toca el mapa · D distancia · G golpe
      </div>
    </div>
  );
}
