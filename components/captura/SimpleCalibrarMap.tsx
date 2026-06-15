"use client";

import { useEffect, useRef } from "react";
import {
  polygonFromRing,
  resolveHolePolygonFeature,
  type LatLon,
} from "@/lib/distances/holeBoundary";
import { addSatelliteLayers, loadLeaflet } from "@/components/captura/mapRotation";

export type SimpleGreenKey = "front" | "center" | "back";

export interface SimpleGreenPoint {
  key: SimpleGreenKey;
  lat: number;
  lon: number;
  label: string;
  color: string;
}

export type SimpleCalibrarMode = "green" | "boundary";

interface SimpleCalibrarMapProps {
  holeNo: number;
  mode: SimpleCalibrarMode;
  greenPoints: SimpleGreenPoint[];
  boundaryRing: LatLon[];
  selectedGreen?: SimpleGreenKey | null;
  selectedVertex?: number | null;
  onGreenMove: (key: SimpleGreenKey, lat: number, lon: number) => void;
  onVertexMove: (index: number, lat: number, lon: number) => void;
  onMapTap: (lat: number, lon: number) => void;
}

export function SimpleCalibrarMap({
  holeNo,
  mode,
  greenPoints,
  boundaryRing,
  selectedGreen = null,
  selectedVertex = null,
  onGreenMove,
  onVertexMove,
  onMapTap,
}: SimpleCalibrarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onGreenMoveRef = useRef(onGreenMove);
  const onVertexMoveRef = useRef(onVertexMove);
  const onMapTapRef = useRef(onMapTap);
  const dragLockRef = useRef(false);
  const framedKeyRef = useRef("");

  onGreenMoveRef.current = onGreenMove;
  onVertexMoveRef.current = onVertexMove;
  onMapTapRef.current = onMapTap;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        center: [20.5625, -100.4078],
        zoom: 17,
        maxZoom: 21,
        zoomControl: false,
        attributionControl: false,
      });
      addSatelliteLayers(map, L);
      map.on("click", (e: any) => {
        if (dragLockRef.current) return;
        onMapTapRef.current(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
      cleanup = () => {
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);

  useEffect(() => {
    framedKeyRef.current = "";
  }, [holeNo]);

  useEffect(() => {
    const map = mapRef.current;
    const lg = layerRef.current;
    if (!map || !lg) return;
    if (dragLockRef.current) return;

    (async () => {
      const L = await loadLeaflet();
      lg.clearLayers();

      const holeFeature = resolveHolePolygonFeature(
        holeNo,
        polygonFromRing(holeNo, boundaryRing).geometry
      );
      if (holeFeature) {
        L.geoJSON(holeFeature, {
          style: {
            color: "#22d3ee",
            weight: 4,
            opacity: 1,
            fillColor: "#0891b2",
            fillOpacity: 0.2,
          },
          interactive: false,
        }).addTo(lg);
      }

      if (mode === "boundary") {
        for (let i = 0; i < boundaryRing.length; i++) {
          const v = boundaryRing[i];
          const selected = selectedVertex === i;
          const size = selected ? 30 : 24;
          const marker = L.marker([v.lat, v.lon], {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="width:${size}px;height:${size}px;border-radius:5px;background:#22d3ee;border:3px solid ${selected ? "#fbbf24" : "#fff"};box-shadow:0 2px 10px rgba(0,0,0,0.75);touch-action:none;"></div>`,
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            }),
            zIndexOffset: selected ? 900 : 800,
          }).addTo(lg);
          marker.on("dragstart", () => {
            dragLockRef.current = true;
          });
          marker.on("dragend", (e: any) => {
            const ll = e.target.getLatLng();
            onVertexMoveRef.current(i, ll.lat, ll.lng);
            setTimeout(() => {
              dragLockRef.current = false;
            }, 120);
          });
        }
      }

      for (const g of greenPoints) {
        const selected = mode === "green" && selectedGreen === g.key;
        // Marcador fino: punto pequeño con mira (crosshair) para calibrar con
        // precisión al hacer zoom. El seleccionado resalta en ámbar.
        const ring = selected ? 18 : 12;
        const ringColor = selected ? "#fbbf24" : "#fff";
        const labelHtml =
          mode === "green"
            ? `<div style="position:absolute;top:50%;left:calc(50% + ${ring / 2 + 4}px);transform:translateY(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:1px 5px;border-radius:5px;font-size:10px;font-weight:700;font-family:Arial,sans-serif;white-space:nowrap;">${g.label}</div>`
            : "";
        const box = 80;
        const c = box / 2;
        const marker = L.marker([g.lat, g.lon], {
          draggable: mode === "green",
          icon: L.divIcon({
            className: "",
            html: `<div style="position:relative;width:${box}px;height:${box}px;touch-action:none;">
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${ring}px;height:${ring}px;border-radius:50%;background:${g.color}cc;border:2px solid ${ringColor};box-shadow:0 1px 5px rgba(0,0,0,0.7);"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:2px;height:${ring + 10}px;background:${ringColor};opacity:0.9;"></div>
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${ring + 10}px;height:2px;background:${ringColor};opacity:0.9;"></div>
              ${labelHtml}
            </div>`,
            iconSize: [box, box],
            iconAnchor: [c, c],
          }),
          zIndexOffset: selected ? 700 : 600,
        }).addTo(lg);
        if (mode === "green") {
          marker.on("dragstart", () => {
            dragLockRef.current = true;
          });
          marker.on("dragend", (e: any) => {
            const ll = e.target.getLatLng();
            onGreenMoveRef.current(g.key, ll.lat, ll.lng);
            setTimeout(() => {
              dragLockRef.current = false;
            }, 120);
          });
        }
      }

      map.invalidateSize();
      // Reencuadra solo cuando cambia el hoyo o el modo; al colocar/arrastrar
      // puntos NO reencuadra (conserva tu zoom para calibrar fino).
      const frameKey = `${holeNo}:${mode}`;
      if (framedKeyRef.current !== frameKey) {
        if (mode === "green" && greenPoints.length > 0) {
          const gb = L.latLngBounds(
            greenPoints.map((g) => [g.lat, g.lon] as [number, number])
          );
          // Zoom cerrado al green para precisión; maxZoom alto.
          map.fitBounds(gb, { padding: [70, 70], maxZoom: 21, animate: false });
        } else if (holeFeature) {
          const bounds = L.geoJSON(holeFeature).getBounds();
          for (const g of greenPoints) bounds.extend([g.lat, g.lon]);
          map.fitBounds(bounds, { padding: [28, 28], maxZoom: 19, animate: false });
        }
        framedKeyRef.current = frameKey;
      }
    })();
  }, [
    holeNo,
    mode,
    greenPoints,
    boundaryRing,
    selectedGreen,
    selectedVertex,
  ]);

  return (
    <div ref={containerRef} className="absolute inset-0 bg-black" />
  );
}
