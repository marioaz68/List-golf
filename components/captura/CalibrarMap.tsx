"use client";

import { useEffect, useRef, useState } from "react";
import {
  bearingDegrees,
  haversineMeters,
  metersToYards,
} from "@/lib/distances/ccqGreens";
import { getHolePolygon } from "@/lib/distances/ccqHolePoints";
import {
  MAP_SCALE,
  addSatelliteLayers,
  frameByProximity,
  loadLeaflet,
  readMapLayout,
  tuneRotatedFraming,
  uprightHtml,
} from "@/components/captura/mapRotation";

export interface CalibrarMarker {
  id: string;
  lat: number;
  lon: number;
  label: string;
  color: string;
}

interface CalibrarMapProps {
  holeNo: number;
  playerLat: number;
  playerLon: number;
  markers: CalibrarMarker[];
}

export function CalibrarMap({
  holeNo,
  playerLat,
  playerLon,
  markers,
}: CalibrarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const playerPosRef = useRef({ lat: playerLat, lon: playerLon });
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mapReady, setMapReady] = useState(false);
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
        zoomSnap: 0,
        zoomControl: false,
        // Mapa fijo: no se puede mover con los dedos (green arriba al centro).
        dragging: false,
        scrollWheelZoom: false,
        tap: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
      });
      addSatelliteLayers(map, L);
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
      requestAnimationFrame(() => {
        if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
      });
      setTimeout(() => {
        if (!cancelled && mapRef.current) mapRef.current.invalidateSize();
      }, 250);
      setMapReady(true);
      cleanup = () => {
        cancelled = true;
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
        setMapReady(false);
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
    // Solo al montar; la posición se actualiza en el efecto de markers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || size.w === 0 || size.h === 0) return;
    map.invalidateSize();
  }, [size.w, size.h]);

  useEffect(() => {
    const map = mapRef.current;
    const lg = layerRef.current;
    const rotator = rotatorRef.current;
    const { viewportW, viewportH, rotW, rotH } = readMapLayout(
      containerRef.current,
      mapDivRef.current
    );
    if (!map || !lg || !rotator || !mapReady || viewportW === 0 || viewportH === 0)
      return;

    (async () => {
      const L = await loadLeaflet();
      lg.clearLayers();

      // Referencia para rotar: punto "Atrás" del green; si no, centro o
      // cualquier marcador del green.
      const backMarker =
        markers.find((m) => m.id === "g-back") ??
        markers.find((m) => m.id === "g-center") ??
        markers.find((m) => m.id === "g-front");
      const bearing = backMarker
        ? bearingDegrees(playerLat, playerLon, backMarker.lat, backMarker.lon)
        : 0;
      rotator.style.transform = `rotate(${-bearing}deg)`;

      const holeFeature = getHolePolygon(holeNo);
      if (holeFeature) {
        L.geoJSON(holeFeature, {
          style: {
            color: "#22d3ee",
            weight: 2,
            fillColor: "#0891b2",
            fillOpacity: 0.1,
          },
          interactive: false,
        }).addTo(lg);
      }

      for (const m of markers) {
        L.marker([m.lat, m.lon], {
          icon: L.divIcon({
            className: "",
            html: uprightHtml(
              `<div style="display:flex;flex-direction:column;align-items:center;">
              <div style="width:16px;height:16px;border-radius:50%;background:${m.color};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.6);"></div>
              <div style="margin-top:2px;background:rgba(0,0,0,0.8);color:#fff;padding:1px 5px;border-radius:5px;font-size:10px;font-weight:700;font-family:Arial,sans-serif;white-space:nowrap;">${m.label}</div>
            </div>`,
              bearing
            ),
            iconSize: [80, 38],
            iconAnchor: [40, 8],
          }),
          interactive: false,
        }).addTo(lg);
      }

      // Posición del jugador (tú)
      L.marker([playerLat, playerLon], {
        icon: L.divIcon({
          className: "",
          html: uprightHtml(
            `<div style="position:relative;width:22px;height:22px;">
            <div style="position:absolute;inset:-7px;border-radius:50%;background:rgba(59,130,246,0.25);animation:cal-pulse 1.8s ease-out infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.6);"></div>
          </div>`,
            bearing
          ),
          iconSize: [22, 22],
          iconAnchor: [11, 11],
        }),
        interactive: false,
        zIndexOffset: 1000,
      }).addTo(lg);

      if (!document.querySelector("style[data-cal-pulse]")) {
        const style = document.createElement("style");
        style.setAttribute("data-cal-pulse", "1");
        style.textContent =
          "@keyframes cal-pulse { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(2.2);opacity:0} }";
        document.head.appendChild(style);
      }

      if (backMarker) {
        const yards = Math.round(
          metersToYards(
            haversineMeters(
              playerLat,
              playerLon,
              backMarker.lat,
              backMarker.lon
            )
          )
        );
        frameByProximity(
          map,
          L,
          bearing,
          playerLat,
          playerLon,
          backMarker.lat,
          backMarker.lon,
          yards,
          viewportW,
          viewportH,
          rotW,
          rotH,
          64,
          52,
          markers.map((m) => [m.lat, m.lon] as [number, number])
        );
      } else {
        map.setView([playerLat, playerLon], 19, { animate: false });
        tuneRotatedFraming(
          map,
          0,
          playerLat,
          playerLon,
          playerLat,
          playerLon,
          viewportW,
          viewportH,
          rotW,
          rotH
        );
      }
    })();
  }, [holeNo, playerLat, playerLon, markers, size.w, size.h, mapReady]);

  const sizePct = MAP_SCALE * 100;
  const offsetPct = ((MAP_SCALE - 1) / 2) * 100;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
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
    </div>
  );
}
