"use client";

import { useEffect, useRef } from "react";
import { getHolePolygon } from "@/lib/distances/ccqHolePoints";

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

export function CalibrarMap({
  holeNo,
  playerLat,
  playerLon,
  markers,
}: CalibrarMapProps) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const didFitRef = useRef(false);

  useEffect(() => {
    if (!mapDivRef.current) return;
    let cleanup = () => {};
    (async () => {
      const L = await loadLeaflet();
      const map = L.map(mapDivRef.current, {
        center: [playerLat, playerLon],
        zoom: 19,
        maxZoom: 21,
        zoomControl: true,
        scrollWheelZoom: false,
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

  // Al cambiar de hoyo, reencuadrar al polígono del hoyo.
  useEffect(() => {
    didFitRef.current = false;
  }, [holeNo]);

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
            fillOpacity: 0.1,
          },
          interactive: false,
        }).addTo(lg);
      }

      for (const m of markers) {
        L.marker([m.lat, m.lon], {
          icon: L.divIcon({
            className: "",
            html: `<div style="display:flex;flex-direction:column;align-items:center;">
              <div style="width:16px;height:16px;border-radius:50%;background:${m.color};border:2px solid #fff;box-shadow:0 1px 5px rgba(0,0,0,0.6);"></div>
              <div style="margin-top:2px;background:rgba(0,0,0,0.8);color:#fff;padding:1px 5px;border-radius:5px;font-size:10px;font-weight:700;font-family:Arial,sans-serif;white-space:nowrap;">${m.label}</div>
            </div>`,
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
          html: `<div style="position:relative;width:22px;height:22px;">
            <div style="position:absolute;inset:-7px;border-radius:50%;background:rgba(59,130,246,0.25);animation:cal-pulse 1.8s ease-out infinite;"></div>
            <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,0.6);"></div>
          </div>`,
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

      map.invalidateSize();
      if (!didFitRef.current) {
        const bounds = L.latLngBounds([[playerLat, playerLon]]);
        if (holeFeature) {
          L.geoJSON(holeFeature).eachLayer((l: any) => {
            if (l.getBounds) bounds.extend(l.getBounds());
          });
        }
        markers.forEach((m) => bounds.extend([m.lat, m.lon]));
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: 20 });
        didFitRef.current = true;
      }
    })();
  }, [holeNo, playerLat, playerLon, markers]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <div ref={mapDivRef} className="absolute inset-0" />
    </div>
  );
}
