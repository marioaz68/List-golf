"use client";

import { useEffect, useRef } from "react";
import {
  type ReferencePointWithYards,
  getHolePolygon,
  zoomForYardsToCenter,
} from "@/lib/distances/ccqHolePoints";

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
};

async function loadLeaflet(): Promise<any> {
  if (!(window as any).L) {
    if (!document.querySelector('link[data-leaflet]')) {
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

function yardLabel(yards: number): string {
  return `${yards}`;
}

/**
 * Mapa satélite del hoyo con posición del jugador, puntos de referencia
 * y medición al tocar. Zoom automático según distancia al green.
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
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const onMapTapRef = useRef(onMapTap);
  onMapTapRef.current = onMapTap;

  // Init map once
  useEffect(() => {
    if (!mapDivRef.current) return;
    let cleanup = () => {};

    (async () => {
      const L = await loadLeaflet();
      const map = L.map(mapDivRef.current, {
        center: [playerLat, playerLon],
        zoom: 17,
        maxZoom: 21,
        zoomControl: false,
        dragging: true,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });

      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        {
          subdomains: ["0", "1", "2", "3"],
          maxZoom: 21,
          maxNativeZoom: 20,
          attribution: "© Google",
        }
      ).addTo(map);

      map.on("click", (e: any) => {
        onMapTapRef.current?.(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      layersRef.current = L.layerGroup().addTo(map);

      cleanup = () => {
        mapRef.current = null;
        layersRef.current = null;
        map.remove();
      };
    })();

    return () => cleanup();
  }, []);

  // Update markers, lines, zoom when data changes
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layersRef.current;
    if (!map || !layerGroup) return;

    (async () => {
      const L = await loadLeaflet();
      layerGroup.clearLayers();

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

      // Líneas a puntos de referencia
      for (const p of referencePoints) {
        const color = KIND_COLOR[p.kind] ?? "#94a3b8";
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
            html: `<div style="background:rgba(0,0,0,0.72);color:#fff;padding:1px 5px;border-radius:6px;font-size:10px;font-weight:700;font-family:Arial,sans-serif;border:1px solid ${color};">${yardLabel(p.yards)}</div>`,
            iconSize: [36, 16],
            iconAnchor: [18, 8],
          }),
          interactive: false,
        }).addTo(layerGroup);

        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
              <div style="width:12px;height:12px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5);"></div>
              <div style="background:rgba(0,0,0,0.75);color:#fff;padding:1px 4px;border-radius:4px;font-size:9px;font-weight:700;font-family:Arial,sans-serif;">${p.shortLabel}</div>
            </div>`,
            iconSize: [24, 32],
            iconAnchor: [12, 6],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      // Tap point
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
            html: `<div style="background:#db2777;color:#fff;padding:2px 7px;border-radius:8px;font-size:12px;font-weight:800;font-family:Arial,sans-serif;">${yardLabel(tapPoint.yards)} yds</div>`,
            iconSize: [48, 20],
            iconAnchor: [24, 10],
          }),
          interactive: false,
        }).addTo(layerGroup);

        L.marker([tapPoint.lat, tapPoint.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#ec4899;border:2px solid #fff;box-shadow:0 0 0 3px rgba(236,72,153,0.4);"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          interactive: false,
        }).addTo(layerGroup);
      }

      // Jugador
      L.marker([playerLat, playerLon], {
        icon: L.divIcon({
          className: "",
          html: `<div style="position:relative;width:20px;height:20px;">
            <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,0.25);animation:yardage-pulse 1.8s ease-out infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.5);"></div>
          </div>`,
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

      // Zoom dinámico: más cerca del green = más zoom
      const targetZoom = zoomForYardsToCenter(yardsToCenter);
      const bounds = L.latLngBounds([
        [playerLat, playerLon],
        ...referencePoints
          .filter((p) =>
            ["green-front", "green-center", "green-back"].includes(p.kind)
          )
          .map((p) => [p.lat, p.lon] as [number, number]),
      ]);
      if (tapPoint) bounds.extend([tapPoint.lat, tapPoint.lon]);

      map.invalidateSize();
      map.fitBounds(bounds, { padding: [36, 36], animate: true, maxZoom: targetZoom });
      if (map.getZoom() > targetZoom) {
        map.setZoom(targetZoom, { animate: true });
      }
    })();
  }, [
    holeNo,
    playerLat,
    playerLon,
    yardsToCenter,
    referencePoints,
    tapPoint,
  ]);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[280px] w-full overflow-hidden rounded-xl border border-slate-700 bg-black"
    >
      <div ref={mapDivRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[9px] text-slate-300">
        Toca el mapa para medir a un punto
      </div>
    </div>
  );
}
