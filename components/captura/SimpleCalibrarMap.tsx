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

export type SimpleCalibrarMode = "green" | "boundary" | "fairway";

interface SimpleCalibrarMapProps {
  holeNo: number;
  mode: SimpleCalibrarMode;
  greenPoints: SimpleGreenPoint[];
  /** Contorno del hoyo (línea azul). */
  boundaryRing: LatLon[];
  /** Contorno del fairway (línea amarilla). Puede ir vacío si no se ha dibujado. */
  fairwayRing: LatLon[];
  selectedGreen?: SimpleGreenKey | null;
  /** Índice del vértice seleccionado dentro del contorno ACTIVO (según mode). */
  selectedVertex?: number | null;
  onGreenMove: (key: SimpleGreenKey, lat: number, lon: number) => void;
  onVertexMove: (index: number, lat: number, lon: number) => void;
  /** Tocar un vértice lo selecciona (para luego borrarlo o ajustarlo). */
  onVertexSelect?: (index: number) => void;
  onMapTap: (lat: number, lon: number) => void;
}

const COLORS = {
  boundary: { line: "#22d3ee", fill: "#0891b2" },
  fairway: { line: "#facc15", fill: "#ca8a04" },
};

export function SimpleCalibrarMap({
  holeNo,
  mode,
  greenPoints,
  boundaryRing,
  fairwayRing,
  selectedGreen = null,
  selectedVertex = null,
  onGreenMove,
  onVertexMove,
  onVertexSelect,
  onMapTap,
}: SimpleCalibrarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onGreenMoveRef = useRef(onGreenMove);
  const onVertexMoveRef = useRef(onVertexMove);
  const onVertexSelectRef = useRef(onVertexSelect);
  const onMapTapRef = useRef(onMapTap);
  const dragLockRef = useRef(false);
  const framedKeyRef = useRef("");

  onGreenMoveRef.current = onGreenMove;
  onVertexMoveRef.current = onVertexMove;
  onVertexSelectRef.current = onVertexSelect;
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

    // Contorno editable activo según el modo.
    const editRing =
      mode === "boundary"
        ? boundaryRing
        : mode === "fairway"
          ? fairwayRing
          : [];
    const editColor =
      mode === "fairway" ? COLORS.fairway.line : COLORS.boundary.line;

    (async () => {
      const L = await loadLeaflet();
      lg.clearLayers();

      // Línea azul del hoyo (siempre visible; tenue si no se está editando).
      const holeFeature = resolveHolePolygonFeature(
        holeNo,
        polygonFromRing(holeNo, boundaryRing).geometry
      );
      if (holeFeature) {
        L.geoJSON(holeFeature, {
          style: {
            color: COLORS.boundary.line,
            weight: mode === "boundary" ? 4 : 2,
            opacity: mode === "boundary" ? 1 : 0.55,
            fillColor: COLORS.boundary.fill,
            fillOpacity: mode === "boundary" ? 0.2 : 0.08,
          },
          interactive: false,
        }).addTo(lg);
      }

      // Línea amarilla del fairway (si ya tiene al menos 3 puntos).
      if (fairwayRing.length >= 3) {
        const fwFeature = polygonFromRing(holeNo, fairwayRing);
        L.geoJSON(fwFeature, {
          style: {
            color: COLORS.fairway.line,
            weight: mode === "fairway" ? 4 : 2,
            opacity: mode === "fairway" ? 1 : 0.55,
            fillColor: COLORS.fairway.fill,
            fillOpacity: mode === "fairway" ? 0.18 : 0.08,
          },
          interactive: false,
        }).addTo(lg);
      }

      // Vértices arrastrables del contorno activo (azul o amarillo). Usan la
      // misma mira (cruz + círculo) que el green: es más precisa que un cuadro.
      if (mode === "boundary" || mode === "fairway") {
        for (let i = 0; i < editRing.length; i++) {
          const v = editRing[i];
          const selected = selectedVertex === i;
          const dot = selected ? 16 : 11;
          const arm = dot + 14;
          const ringColor = selected ? "#fb7185" : "#fff";
          const box = 56;
          const c = box / 2;
          const marker = L.marker([v.lat, v.lon], {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="position:relative;width:${box}px;height:${box}px;touch-action:none;">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:2px;height:${arm}px;background:${ringColor};opacity:0.95;"></div>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${arm}px;height:2px;background:${ringColor};opacity:0.95;"></div>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${dot}px;height:${dot}px;border-radius:50%;background:${editColor}dd;border:2px solid ${ringColor};box-shadow:0 1px 6px rgba(0,0,0,0.8);"></div>
              </div>`,
              iconSize: [box, box],
              iconAnchor: [c, c],
            }),
            zIndexOffset: selected ? 900 : 800,
          }).addTo(lg);
          // Tocar el vértice lo selecciona (para borrarlo/ajustarlo) sin que el
          // mapa registre un "tap" que agregaría otro punto.
          marker.on("click", () => {
            onVertexSelectRef.current?.(i);
          });
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

      // Puntos del green (entrada/centro/atrás) con mira fina.
      for (const g of greenPoints) {
        const selected = mode === "green" && selectedGreen === g.key;
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
          map.fitBounds(gb, { padding: [70, 70], maxZoom: 21, animate: false });
        } else if (mode === "fairway" && fairwayRing.length >= 2) {
          const fb = L.latLngBounds(
            fairwayRing.map((v) => [v.lat, v.lon] as [number, number])
          );
          map.fitBounds(fb, { padding: [40, 40], maxZoom: 19, animate: false });
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
    fairwayRing,
    selectedGreen,
    selectedVertex,
  ]);

  return <div ref={containerRef} className="absolute inset-0 bg-black" />;
}
