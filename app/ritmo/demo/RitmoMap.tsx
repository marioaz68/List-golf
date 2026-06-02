"use client";

import { useEffect, useRef } from "react";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";

interface GroupDot {
  id: string;
  number: number;
  lat: number;
  lon: number;
  hoyo: number;
  status: "en_ritmo" | "adelantado" | "atrasado";
  label: string;
}

const STATUS_COLOR: Record<GroupDot["status"], string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
};

const HOYO_COLORS = [
  "#FF1744","#00E676","#FFEA00","#2979FF","#FF9100","#D500F9",
  "#00E5FF","#F50057","#76FF03","#FF80AB","#1DE9B6","#B388FF",
  "#FFAB40","#EEFF41","#FF6E40","#69F0AE","#FFFF8D","#FFD180",
];

export function RitmoMap({ groups }: { groups: GroupDot[] }) {
  const mapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;
    let leafletMap: any = null;
    let cleanup = () => {};

    // Cargar Leaflet dinámicamente desde CDN (sin agregar dep a package.json)
    (async () => {
      // CSS
      if (!document.querySelector('link[data-leaflet]')) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        css.setAttribute("data-leaflet", "1");
        document.head.appendChild(css);
      }
      // JS
      if (!(window as any).L) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Leaflet failed to load"));
          document.head.appendChild(script);
        });
      }
      const L = (window as any).L;

      const map = L.map(mapRef.current, {
        center: [20.5625, -100.4078],
        zoom: 17,
        maxZoom: 20,
        zoomControl: true,
      });
      leafletMap = map;

      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}",
        { subdomains: ["0", "1", "2", "3"], maxZoom: 21, maxNativeZoom: 20, attribution: "© Google" }
      ).addTo(map);

      // Polígonos de hoyos
      const holesLayer = L.geoJSON(CCQ_HOLES, {
        style: (f: any) => ({
          color: HOYO_COLORS[(f.properties.hoyo - 1) % HOYO_COLORS.length],
          weight: 1.5,
          fillOpacity: 0.15,
          fillColor: HOYO_COLORS[(f.properties.hoyo - 1) % HOYO_COLORS.length],
        }),
      }).addTo(map);

      // Etiquetas de hoyos
      CCQ_HOLES.features.forEach((f: any) => {
        const center = L.geoJSON(f).getBounds().getCenter();
        L.marker(center, {
          icon: L.divIcon({
            className: "",
            html: `<div style="background:rgba(0,0,0,0.6);color:#fff;border:1px solid ${HOYO_COLORS[(f.properties.hoyo-1)%HOYO_COLORS.length]};padding:1px 6px;border-radius:10px;font-weight:600;font-size:10px;font-family:Arial,sans-serif;">H${f.properties.hoyo}</div>`,
            iconSize: [24, 18], iconAnchor: [12, 9],
          }),
          interactive: false,
        }).addTo(map);
      });

      // Puntos de los grupos
      const groupMarkers: any[] = [];
      groups.forEach((g) => {
        const color = STATUS_COLOR[g.status];
        const marker = L.marker([g.lat, g.lon], {
          icon: L.divIcon({
            className: "",
            html: `
              <div style="position:relative;">
                <div style="
                  position:absolute; left:-14px; top:-14px;
                  width:28px; height:28px; border-radius:50%;
                  background:${color};
                  border:3px solid #fff;
                  box-shadow:0 2px 6px rgba(0,0,0,0.5);
                  display:flex; align-items:center; justify-content:center;
                  color:#fff; font-weight:700; font-size:13px;
                  font-family:Arial,sans-serif;
                ">${g.number}</div>
                <div style="
                  position:absolute; left:18px; top:-10px;
                  background:rgba(0,0,0,0.85); color:#fff;
                  padding:2px 8px; border-radius:6px;
                  font-size:11px; white-space:nowrap;
                  font-family:Arial,sans-serif;
                  border:1px solid ${color};
                ">${g.label}</div>
              </div>
            `,
            iconSize: [0, 0],
          }),
        }).addTo(map);
        groupMarkers.push(marker);
      });

      // Ajustar al campo con padding mínimo (que llene la pantalla)
      const fitToCourse = () => {
        map.invalidateSize();
        map.fitBounds(holesLayer.getBounds(), { padding: [10, 10] });
      };
      fitToCourse();

      // Re-ajustar si cambia el tamaño de ventana o rota el dispositivo
      const onResize = () => fitToCourse();
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);

      cleanup = () => {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
        map.remove();
      };
    })();

    return () => cleanup();
  }, [groups]);

  return <div ref={mapRef} style={{ width: "100%", height: "100%" }} />;
}
