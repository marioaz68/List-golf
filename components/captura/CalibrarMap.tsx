"use client";

import { useEffect, useRef, useState } from "react";
import {
  bearingDegrees,
  haversineMeters,
  metersToYards,
} from "@/lib/distances/ccqGreens";
import {
  polygonFromRing,
  resolveHolePolygonFeature,
  type LatLon,
} from "@/lib/distances/holeBoundary";
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

export type CalibrarEditMode = "off" | "points" | "boundary";

interface CalibrarMapProps {
  holeNo: number;
  playerLat: number;
  playerLon: number;
  markers: CalibrarMarker[];
  boundaryRing: LatLon[];
  editMode?: CalibrarEditMode;
  /** Punto o vértice seleccionado para colocar con toque en el mapa. */
  selectedId?: string | null;
  selectedVertex?: number | null;
  onMarkerDrag?: (id: string, lat: number, lon: number) => void;
  onBoundaryVertexDrag?: (index: number, lat: number, lon: number) => void;
  onMapTap?: (lat: number, lon: number) => void;
}

export function CalibrarMap({
  holeNo,
  playerLat,
  playerLon,
  markers,
  boundaryRing,
  editMode = "off",
  selectedId = null,
  selectedVertex = null,
  onMarkerDrag,
  onBoundaryVertexDrag,
  onMapTap,
}: CalibrarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const playerPosRef = useRef({ lat: playerLat, lon: playerLon });
  const onMarkerDragRef = useRef(onMarkerDrag);
  const onBoundaryVertexDragRef = useRef(onBoundaryVertexDrag);
  const onMapTapRef = useRef(onMapTap);
  const editingRef = useRef(editMode !== "off");
  const draggingRef = useRef(false);
  const framedHoleRef = useRef(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [mapReady, setMapReady] = useState(false);
  const editing = editMode !== "off";

  playerPosRef.current = { lat: playerLat, lon: playerLon };
  onMarkerDragRef.current = onMarkerDrag;
  onBoundaryVertexDragRef.current = onBoundaryVertexDrag;
  onMapTapRef.current = onMapTap;
  editingRef.current = editing;

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
        dragging: false,
        scrollWheelZoom: false,
        tap: true,
        doubleClickZoom: false,
        touchZoom: true,
        boxZoom: false,
        keyboard: false,
      });
      addSatelliteLayers(map, L);
      map.on("click", (e: any) => {
        if (!editingRef.current) return;
        onMapTapRef.current?.(e.latlng.lat, e.latlng.lng);
      });
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      map.invalidateSize();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // En modo edición: mapa movible con el dedo; en modo normal: fijo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (editing) {
      map.dragging.enable();
      map.touchZoom.enable();
    } else {
      map.dragging.disable();
      map.touchZoom.disable();
    }
  }, [editing, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || size.w === 0 || size.h === 0) return;
    map.invalidateSize();
  }, [size.w, size.h]);

  useEffect(() => {
    framedHoleRef.current = 0;
  }, [holeNo, editMode]);

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
    if (draggingRef.current) return;

    (async () => {
      const L = await loadLeaflet();
      lg.clearLayers();

      const backMarker =
        markers.find((m) => m.id === "g-back") ??
        markers.find((m) => m.id === "g-center") ??
        markers.find((m) => m.id === "g-front");
      const bearing =
        !editing && backMarker
          ? bearingDegrees(playerLat, playerLon, backMarker.lat, backMarker.lon)
          : 0;

      // En edición: vista de arriba (sin rotar) para ver el hoyo completo.
      rotator.style.transform = editing ? "rotate(0deg)" : `rotate(${-bearing}deg)`;

      const holeFeature = resolveHolePolygonFeature(
        holeNo,
        polygonFromRing(holeNo, boundaryRing).geometry
      );
      if (holeFeature) {
        L.geoJSON(holeFeature, {
          style: {
            color: "#22d3ee",
            weight: editing ? 4 : 2,
            opacity: 1,
            fillColor: "#0891b2",
            fillOpacity: editing ? 0.18 : 0.1,
          },
          interactive: false,
        }).addTo(lg);
      }

      if (editMode === "boundary") {
        for (let i = 0; i < boundaryRing.length; i++) {
          const v = boundaryRing[i];
          const selected = selectedVertex === i;
          const marker = L.marker([v.lat, v.lon], {
            draggable: true,
            icon: L.divIcon({
              className: "",
              html: `<div style="width:${selected ? 28 : 22}px;height:${selected ? 28 : 22}px;border-radius:4px;background:#22d3ee;border:3px solid ${selected ? "#fbbf24" : "#fff"};box-shadow:0 2px 8px rgba(0,0,0,0.8);touch-action:none;"></div>`,
              iconSize: [selected ? 28 : 22, selected ? 28 : 22],
              iconAnchor: [selected ? 14 : 11, selected ? 14 : 11],
            }),
            zIndexOffset: selected ? 950 : 900,
          }).addTo(lg);
          marker.on("dragstart", () => {
            draggingRef.current = true;
          });
          marker.on("dragend", (e: any) => {
            draggingRef.current = false;
            const ll = e.target.getLatLng();
            onBoundaryVertexDragRef.current?.(i, ll.lat, ll.lng);
          });
        }
      }

      const pointsEditable = editMode === "points";
      for (const m of markers) {
        const selected = selectedId === m.id;
        const marker = L.marker([m.lat, m.lon], {
          draggable: pointsEditable,
          icon: L.divIcon({
            className: "",
            html: editing
              ? `<div style="display:flex;flex-direction:column;align-items:center;touch-action:none;">
              <div style="width:${selected ? 26 : 20}px;height:${selected ? 26 : 20}px;border-radius:50%;background:${m.color};border:3px solid ${selected ? "#fbbf24" : "#fff"};box-shadow:0 2px 8px rgba(0,0,0,0.7);"></div>
              <div style="margin-top:2px;background:rgba(0,0,0,0.85);color:#fff;padding:2px 6px;border-radius:6px;font-size:11px;font-weight:800;font-family:Arial,sans-serif;white-space:nowrap;">${m.label}</div>
            </div>`
              : uprightHtml(
                  `<div style="display:flex;flex-direction:column;align-items:center;">
              <div style="width:16px;height:16px;border-radius:50%;background:${m.color};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.6);"></div>
              <div style="margin-top:2px;background:rgba(0,0,0,0.8);color:#fff;padding:1px 5px;border-radius:5px;font-size:10px;font-weight:700;font-family:Arial,sans-serif;white-space:nowrap;">${m.label}</div>
            </div>`,
                  bearing
                ),
            iconSize: editing ? [90, 44] : [80, 38],
            iconAnchor: editing ? [45, 10] : [40, 8],
          }),
          interactive: pointsEditable || editing,
          zIndexOffset: selected ? 920 : 0,
        }).addTo(lg);
        if (pointsEditable) {
          marker.on("dragstart", () => {
            draggingRef.current = true;
          });
          marker.on("dragend", (e: any) => {
            draggingRef.current = false;
            const ll = e.target.getLatLng();
            onMarkerDragRef.current?.(m.id, ll.lat, ll.lng);
          });
        }
      }

      if (!editing) {
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
      }

      if (!document.querySelector("style[data-cal-pulse]")) {
        const style = document.createElement("style");
        style.setAttribute("data-cal-pulse", "1");
        style.textContent =
          "@keyframes cal-pulse { 0%{transform:scale(0.8);opacity:1} 100%{transform:scale(2.2);opacity:0} }";
        document.head.appendChild(style);
      }

      const holeChanged = framedHoleRef.current !== holeNo;

      if (editing && holeFeature) {
        const bounds = L.geoJSON(holeFeature).getBounds();
        for (const m of markers) bounds.extend([m.lat, m.lon]);
        if (!bounds.isValid()) {
          bounds.extend([playerLat, playerLon]);
        }
        map.fitBounds(bounds, { padding: [36, 36], maxZoom: 19, animate: false });
        framedHoleRef.current = holeNo;
      } else if (!editing && backMarker) {
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
          48,
          56,
          markers.map((m) => [m.lat, m.lon] as [number, number]),
          holeChanged
        );
        framedHoleRef.current = holeNo;
      } else if (!editing) {
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
  }, [
    holeNo,
    playerLat,
    playerLon,
    markers,
    boundaryRing,
    editMode,
    editing,
    selectedId,
    selectedVertex,
    size.w,
    size.h,
    mapReady,
  ]);

  const sizePct = editing ? 100 : MAP_SCALE * 100;
  const offsetPct = editing ? 0 : ((MAP_SCALE - 1) / 2) * 100;

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-black">
      <div
        ref={rotatorRef}
        className="absolute"
        style={{
          left: editing ? 0 : `-${offsetPct}%`,
          top: editing ? 0 : `-${offsetPct}%`,
          width: editing ? "100%" : `${sizePct}%`,
          height: editing ? "100%" : `${sizePct}%`,
          transformOrigin: "center center",
        }}
      >
        <div ref={mapDivRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
