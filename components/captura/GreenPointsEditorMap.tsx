"use client";

import { useEffect, useRef } from "react";
import { getHolePolygon } from "@/lib/distances/ccqHolePoints";
import type { LatLon } from "@/lib/distances/greenPoints";

export type GreenPointKey = "front" | "center" | "back";

interface GreenPointsEditorMapProps {
  holeNo: number;
  front: LatLon;
  center: LatLon;
  back: LatLon;
  onDrag: (key: GreenPointKey, lat: number, lon: number) => void;
}

const GREEN_STYLE: Record<
  GreenPointKey,
  { label: string; short: string; color: string }
> = {
  front: { label: "Entrada", short: "Ent", color: "#34d399" },
  center: { label: "Centro", short: "Cen", color: "#10b981" },
  back: { label: "Atrás", short: "Atr", color: "#059669" },
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
      s.onerror = () => reject(new Error("Leaflet failed"));
      document.head.appendChild(s);
    });
  }
  return (window as any).L;
}

export function GreenPointsEditorMap({
  holeNo,
  front,
  center,
  back,
  onDrag,
}: GreenPointsEditorMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onDragRef = useRef(onDrag);
  onDragRef.current = onDrag;

  useEffect(() => {
    if (!mapDivRef.current) return;
    let cleanup = () => {};
    (async () => {
      const L = await loadLeaflet();
      const map = L.map(mapDivRef.current, {
        center: [center.lat, center.lon],
        zoom: 18,
        maxZoom: 21,
      });
      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        {
          subdomains: ["0", "1", "2", "3"],
          maxZoom: 21,
          maxNativeZoom: 20,
          detectRetina: true,
          attribution: "© Google",
        }
      ).addTo(map);
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
            fillOpacity: 0.12,
          },
        }).addTo(lg);
      }

      const points: Array<{ key: GreenPointKey; pos: LatLon }> = [
        { key: "front", pos: front },
        { key: "center", pos: center },
        { key: "back", pos: back },
      ];

      for (const { key, pos } of points) {
        const style = GREEN_STYLE[key];
        const marker = L.marker([pos.lat, pos.lon], {
          draggable: true,
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;flex-direction:column;align-items:center;cursor:grab;">
              <div style="width:18px;height:18px;border-radius:50%;background:${style.color};border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.55);"></div>
              <div style="margin-top:2px;background:rgba(0,0,0,0.82);color:#fff;padding:2px 6px;border-radius:6px;font-size:10px;font-weight:800;font-family:Arial,sans-serif;">${style.label}</div>
            </div>`,
            iconSize: [72, 40],
            iconAnchor: [36, 9],
          }),
        }).addTo(lg);
        marker.on("dragend", (e: any) => {
          const ll = e.target.getLatLng();
          onDragRef.current(key, ll.lat, ll.lng);
        });
      }

      map.invalidateSize();
      const bounds = L.latLngBounds([
        [front.lat, front.lon],
        [center.lat, center.lon],
        [back.lat, back.lon],
      ]);
      map.fitBounds(bounds, { padding: [48, 48], maxZoom: 19 });
    })();
  }, [holeNo, front, center, back]);

  return (
    <div className="relative h-[min(52vh,420px)] w-full overflow-hidden rounded-lg border border-slate-700 bg-black">
      <div ref={mapDivRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-black/70 px-2 py-1 text-[10px] text-slate-300">
        Arrastra los puntos verdes · Entrada · Centro · Atrás
      </div>
    </div>
  );
}
