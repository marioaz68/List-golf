"use client";

import { useEffect, useRef } from "react";
import { getHolePolygon } from "@/lib/distances/ccqHolePoints";
import type { DbReferencePoint } from "@/lib/distances/courseReferencePoints";

interface CoursePointEditorMapProps {
  holeNo: number;
  points: DbReferencePoint[];
  pendingLatLon?: { lat: number; lon: number } | null;
  onMapClick: (lat: number, lon: number) => void;
}

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
      s.onerror = () => reject(new Error("Leaflet failed"));
      document.head.appendChild(s);
    });
  }
  return (window as any).L;
}

const KIND_COLOR: Record<string, string> = {
  bunker: "#eab308",
  water: "#38bdf8",
  dogleg: "#a78bfa",
  hazard: "#f97316",
  other: "#94a3b8",
  custom: "#f472b6",
};

export function CoursePointEditorMap({
  holeNo,
  points,
  pendingLatLon,
  onMapClick,
}: CoursePointEditorMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onClickRef = useRef(onMapClick);
  onClickRef.current = onMapClick;

  useEffect(() => {
    if (!mapDivRef.current) return;
    let cleanup = () => {};
    (async () => {
      const L = await loadLeaflet();
      const map = L.map(mapDivRef.current, {
        center: [20.5625, -100.4078],
        zoom: 17,
        maxZoom: 21,
      });
      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        { subdomains: ["0", "1", "2", "3"], maxZoom: 21, maxNativeZoom: 20 }
      ).addTo(map);
      map.on("click", (e: any) =>
        onClickRef.current(e.latlng.lat, e.latlng.lng)
      );
      mapRef.current = map;
      layerRef.current = L.layerGroup().addTo(map);
      cleanup = () => {
        map.remove();
        mapRef.current = null;
        layerRef.current = null;
      };
    })();
    return () => cleanup();
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const lg = layerRef.current;
    if (!map || !lg) return;
    (async () => {
      const L = await loadLeaflet();
      lg.clearLayers();
      const holeFeature = getHolePolygon(holeNo);
      if (holeFeature) {
        L.geoJSON(holeFeature, {
          style: {
            color: "#22d3ee",
            weight: 2,
            fillColor: "#0891b2",
            fillOpacity: 0.15,
          },
        }).addTo(lg);
      }
      for (const p of points) {
        const color = KIND_COLOR[p.kind] ?? "#94a3b8";
        L.marker([p.lat, p.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;flex-direction:column;align-items:center;">
              <div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;"></div>
              <div style="margin-top:2px;background:rgba(0,0,0,0.8);color:#fff;padding:1px 4px;border-radius:4px;font-size:9px;font-weight:700;max-width:80px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.label}</div>
            </div>`,
            iconSize: [80, 36],
            iconAnchor: [40, 7],
          }),
        }).addTo(lg);
      }
      if (pendingLatLon) {
        L.marker([pendingLatLon.lat, pendingLatLon.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="width:16px;height:16px;border-radius:50%;background:#ec4899;border:3px solid #fff;box-shadow:0 0 0 4px rgba(236,72,153,0.35);"></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          }),
        }).addTo(lg);
      }
      map.invalidateSize();
      if (holeFeature) {
        const bounds = L.geoJSON(holeFeature).getBounds();
        points.forEach((p) => bounds.extend([p.lat, p.lon]));
        if (pendingLatLon) bounds.extend([pendingLatLon.lat, pendingLatLon.lon]);
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 18 });
      }
    })();
  }, [holeNo, points, pendingLatLon]);

  return (
    <div className="relative h-[min(52vh,420px)] w-full overflow-hidden rounded-lg border border-slate-700 bg-black">
      <div ref={mapDivRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-slate-300">
        Toca el mapa para colocar un punto
      </div>
    </div>
  );
}
