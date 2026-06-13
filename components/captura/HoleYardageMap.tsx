"use client";

import { useEffect, useRef, useState } from "react";
import { bearingDegrees } from "@/lib/distances/ccqGreens";
import {
  type ReferencePointWithYards,
  getHolePolygon,
} from "@/lib/distances/ccqHolePoints";
import {
  MAP_SCALE,
  frameByProximity,
  loadLeaflet,
  screenToLatLng,
  tuneRotatedFraming,
  uprightHtml,
} from "@/components/captura/mapRotation";

export interface TapPoint {
  lat: number;
  lon: number;
  yards: number;
}

interface HoleYardageMapProps {
  holeNo: number;
  playerLat: number;
  playerLon: number;
  yardsToCenter: number;
  referencePoints: ReferencePointWithYards[];
  tapPoint?: TapPoint | null;
  onMapTap?: (lat: number, lon: number) => void;
}

const KIND_COLOR: Record<string, string> = {
  "green-front": "#34d399",
  "green-center": "#10b981",
  "green-back": "#059669",
  tee: "#fbbf24",
  corner: "#94a3b8",
  custom: "#f472b6",
  bunker: "#eab308",
  water: "#38bdf8",
  dogleg: "#a78bfa",
  hazard: "#f97316",
  other: "#94a3b8",
};

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
  playerLat,
  playerLon,
  yardsToCenter,
  referencePoints,
  tapPoint,
  onMapTap,
}: HoleYardageMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const bearingRef = useRef(0);
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

  // Init map once when we have dimensions
  useEffect(() => {
    if (!mapDivRef.current || size.w === 0 || size.h === 0) return;
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
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      L.tileLayer("https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
        subdomains: ["0", "1", "2", "3"],
        maxZoom: 21,
        maxNativeZoom: 20,
        detectRetina: true,
        attribution: "© Google",
      }).addTo(map);

      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
      setMapReady(true);

      const onTap = (e: MouseEvent | TouchEvent) => {
        if (!onMapTapRef.current || !mapRef.current) return;
        const clientX =
          "touches" in e ? e.changedTouches[0].clientX : e.clientX;
        const clientY =
          "touches" in e ? e.changedTouches[0].clientY : e.clientY;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const { w, h } = sizeRef.current;
        const rotW = w * MAP_SCALE;
        const rotH = h * MAP_SCALE;
        const latlng = screenToLatLng(
          clientX,
          clientY,
          rect,
          bearingRef.current,
          rotW,
          rotH,
          mapRef.current,
          L
        );
        onMapTapRef.current(latlng.lat, latlng.lng);
      };

      const container = containerRef.current;
      container?.addEventListener("click", onTap);

      cleanup = () => {
        cancelled = true;
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
    // Solo inicializa una vez que hay tamaño. La posición del jugador se
    // actualiza en el efecto de markers; recrear el mapa en cada GPS rompía
    // la rotación/encuadre.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.w, size.h]);

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
    if (!map || !layerGroup || !rotator || size.w === 0 || size.h === 0 || !mapReady)
      return;

    (async () => {
      const L = await loadLeaflet();
      layerGroup.clearLayers();

      const greenCenter = referencePoints.find((p) => p.kind === "green-center");
      const greenTarget =
        greenCenter ??
        referencePoints.find((p) => p.kind === "green-back") ??
        referencePoints.find((p) => p.kind === "green-front");
      const bearing = greenTarget
        ? bearingDegrees(
            playerLat,
            playerLon,
            greenTarget.lat,
            greenTarget.lon
          )
        : 0;
      bearingRef.current = bearing;
      rotator.style.transform = `rotate(${-bearing}deg)`;

      const holeFeature = getHolePolygon(holeNo);
      if (holeFeature) {
        L.geoJSON(holeFeature, {
          style: {
            color: "#22d3ee",
            weight: 2,
            opacity: 0.85,
            fillColor: "#0891b2",
            fillOpacity: 0.12,
          },
          interactive: false,
        }).addTo(layerGroup);
      }

      for (const p of referencePoints) {
        const color =
          p.kind === "custom" && p.dbKind
            ? (KIND_COLOR[p.dbKind] ?? KIND_COLOR.custom)
            : (KIND_COLOR[p.kind] ?? "#94a3b8");
        L.polyline(
          [
            [playerLat, playerLon],
            [p.lat, p.lon],
          ],
          { color, weight: 1.5, opacity: 0.55, dashArray: "4 6" }
        ).addTo(layerGroup);

        const midLat = (playerLat + p.lat) / 2;
        const midLon = (playerLon + p.lon) / 2;
        L.marker([midLat, midLon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="background:rgba(0,0,0,0.72);color:#fff;padding:1px 5px;border-radius:6px;font-size:10px;font-weight:700;font-family:Arial,sans-serif;border:1px solid ${color};">${yardLabel(p.yards)}</div>`,
              bearing
            ),
            iconSize: [36, 16],
            iconAnchor: [18, 8],
          }),
          interactive: false,
        }).addTo(layerGroup);

        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
              <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>
              <div style="background:rgba(0,0,0,0.75);color:#fff;padding:1px 4px;border-radius:4px;font-size:9px;font-weight:700;font-family:Arial,sans-serif;">${p.shortLabel}</div>
            </div>`,
              bearing
            ),
            iconSize: [24, 32],
            iconAnchor: [12, 6],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      if (tapPoint) {
        L.polyline(
          [
            [playerLat, playerLon],
            [tapPoint.lat, tapPoint.lon],
          ],
          { color: "#f472b6", weight: 2.5, opacity: 0.9 }
        ).addTo(layerGroup);

        const midLat = (playerLat + tapPoint.lat) / 2;
        const midLon = (playerLon + tapPoint.lon) / 2;
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

      const rotW = size.w * MAP_SCALE;
      const rotH = size.h * MAP_SCALE;

      map.invalidateSize();

      if (greenTarget && !tapPoint) {
        // Juego normal: zoom por cercanía (acerca más rápido cerca del green).
        frameByProximity(
          map,
          bearing,
          playerLat,
          playerLon,
          greenTarget.lat,
          greenTarget.lon,
          yardsToCenter,
          size.w,
          size.h,
          rotW,
          rotH
        );
      } else {
        // Con punto tocado: encuadra jugador + green + medición para que la
        // distancia tocada quede siempre visible.
        map.fitBounds(bounds, {
          paddingTopLeft: [16, 68],
          paddingBottomRight: [16, 52],
          animate: true,
          maxZoom: 20,
        });
        if (greenTarget) {
          tuneRotatedFraming(
            map,
            bearing,
            playerLat,
            playerLon,
            greenTarget.lat,
            greenTarget.lon,
            size.w,
            size.h,
            rotW,
            rotH
          );
        }
      }
    })();
  }, [
    holeNo,
    playerLat,
    playerLon,
    yardsToCenter,
    referencePoints,
    tapPoint,
    size.w,
    size.h,
    mapReady,
  ]);

  const rotW = size.w * MAP_SCALE;
  const rotH = size.h * MAP_SCALE;

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-black"
    >
      {size.w > 0 && size.h > 0 && (
        <div
          ref={rotatorRef}
          className="absolute"
          style={{
            left: "50%",
            top: "50%",
            width: rotW,
            height: rotH,
            marginLeft: -rotW / 2,
            marginTop: -rotH / 2,
            transformOrigin: "center center",
          }}
        >
          <div ref={mapDivRef} className="absolute inset-0" />
        </div>
      )}
      <div className="pointer-events-none absolute bottom-9 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] text-slate-300">
        Toca el mapa para medir
      </div>
    </div>
  );
}
