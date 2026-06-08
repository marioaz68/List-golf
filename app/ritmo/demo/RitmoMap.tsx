"use client";

import { useEffect, useRef, useState } from "react";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";

interface RitmoMapProps {
  groups: GroupDot[];
  selectedId?: string | null;
  /** Si true, rota el mapa 90° (mejor para landscape). Default true. */
  rotate?: boolean;
  /** Al tocar la bola de un grupo en el mapa. El padre decide alternar
   *  (mismo id → null para volver a vista completa). */
  onSelectGroup?: (id: string) => void;
}

export interface GroupDot {
  id: string;
  number: number;
  lat: number;
  lon: number;
  hoyo: number;
  status: "en_ritmo" | "adelantado" | "atrasado" | "sin_datos";
  label: string;
  detail?: string;
  role?: "normal" | "blocker" | "blocked";
  blockedBy?: number;
}

const STATUS_COLOR: Record<GroupDot["status"], string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
  sin_datos: "#6b7280",
};
const BLOCKED_COLOR = "#f59e0b"; // amarillo/naranja para "víctimas"

const HOYO_COLORS = [
  "#FF1744","#00E676","#FFEA00","#2979FF","#FF9100","#D500F9",
  "#00E5FF","#F50057","#76FF03","#FF80AB","#1DE9B6","#B388FF",
  "#FFAB40","#EEFF41","#FF6E40","#69F0AE","#FFFF8D","#FFD180",
];

/**
 * Mapa rotado 90° con CSS para que el eje largo del campo quede horizontal
 * y aproveche mejor la pantalla landscape. El contenido visible (markers,
 * etiquetas) se contra-rotan para que el texto siga legible.
 */
export function RitmoMap({
  groups,
  selectedId,
  rotate = true,
  onSelectGroup,
}: RitmoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const holesLayerRef = useRef<any>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Ref siempre fresco para que el click del marker llame al último callback
  // sin necesidad de reconstruir el mapa.
  const onSelectGroupRef = useRef<RitmoMapProps["onSelectGroup"]>(undefined);
  onSelectGroupRef.current = onSelectGroup;

  // Medir el container y reaccionar a resize/rotación
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Inicializar/reiniciar Leaflet cuando hay tamaño válido
  useEffect(() => {
    if (!mapDivRef.current || size.w === 0 || size.h === 0) return;
    let cleanup = () => {};

    (async () => {
      // Cargar Leaflet desde CDN sin agregar dep
      if (!document.querySelector('link[data-leaflet]')) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        css.setAttribute("data-leaflet", "1");
        document.head.appendChild(css);
      }
      if (!(window as any).L) {
        await new Promise<void>((resolve, reject) => {
          const s = document.createElement("script");
          s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          s.onload = () => resolve();
          s.onerror = () => reject(new Error("Leaflet failed to load"));
          document.head.appendChild(s);
        });
      }
      const L = (window as any).L;

      // Mapa "fijo": sin paneo ni zoom manual para que el campo nunca se
      // salga de la pantalla. La cámara se controla solo por código
      // (vista completa por defecto, zoom al grupo seleccionado).
      const map = L.map(mapDivRef.current, {
        center: [20.5625, -100.4078],
        zoom: 17,
        maxZoom: 20,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        touchZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false,
      });

      // Satélite "puro" (sin labels de calle) para que la rotación no las muestre sideways
      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        { subdomains: ["0", "1", "2", "3"], maxZoom: 21, maxNativeZoom: 20, attribution: "© Google" }
      ).addTo(map);

      // Capa invisible solo para calcular bounds del campo (no se dibuja)
      const holesLayer = L.geoJSON(CCQ_HOLES, {
        style: () => ({ opacity: 0, fillOpacity: 0, weight: 0 }),
      });
      holesLayerRef.current = holesLayer;
      mapRef.current = map;
      // (No la agregamos al mapa — solo la usamos para fitBounds más abajo)

      // Etiquetas de hoyos, contra-rotadas para que el texto se lea horizontal
      CCQ_HOLES.features.forEach((f: any) => {
        const center = L.geoJSON(f).getBounds().getCenter();
        L.marker(center, {
          icon: L.divIcon({
            className: "",
            html: `<div style="transform: ${rotate ? 'rotate(90deg)' : 'none'}; transform-origin: center;">
              <div style="background:rgba(0,0,0,0.75);color:#fff;border:1px solid ${HOYO_COLORS[(f.properties.hoyo-1)%HOYO_COLORS.length]};padding:1px 6px;border-radius:10px;font-weight:700;font-size:11px;font-family:Arial,sans-serif;display:inline-block;">H${f.properties.hoyo}</div>
            </div>`,
            iconSize: [30, 22], iconAnchor: [15, 11],
          }),
          interactive: false,
        }).addTo(map);
      });

      // Puntos de grupos
      groups.forEach((g) => {
        const isBlocker = g.role === "blocker";
        const isBlocked = g.role === "blocked";
        const color = isBlocked ? BLOCKED_COLOR : STATUS_COLOR[g.status];
        const ring = isBlocker
          ? `<div style="
              position:absolute; left:-7px; top:-7px;
              width:50px; height:50px; border-radius:50%;
              border:3px solid ${color};
              animation: pulse-ring 1.5s ease-out infinite;
              pointer-events:none;
            "></div>`
          : "";
        const blockerIcon = isBlocker
          ? `<div style="position:absolute; left:30px; top:-26px; font-size:22px;">🚦</div>`
          : "";

        const marker = L.marker([g.lat, g.lon], {
          icon: L.divIcon({
            className: "",
            html: `
              <div style="transform: ${rotate ? 'rotate(90deg)' : 'none'}; transform-origin: center; position: relative; cursor: pointer;">
                ${ring}
                <div style="
                  width:36px; height:36px; border-radius:50%;
                  background:${color};
                  border:3px solid #fff;
                  box-shadow:0 2px 10px rgba(0,0,0,0.7);
                  display:flex; align-items:center; justify-content:center;
                  color:#fff; font-weight:800; font-size:16px;
                  font-family:Arial,sans-serif;
                ">${g.number}</div>
                ${blockerIcon}
              </div>
            `,
            iconSize: [36, 36],
            iconAnchor: [18, 18],
          }),
          keyboard: false,
        }).addTo(map);
        // Tocar la bola: el padre alterna (zoom al grupo / volver a completo).
        marker.on("click", () => onSelectGroupRef.current?.(g.id));
      });

      // Animación CSS para el anillo pulsante del bloqueador
      if (!document.querySelector("style[data-ritmo-anim]")) {
        const style = document.createElement("style");
        style.setAttribute("data-ritmo-anim", "1");
        style.innerHTML = `
          @keyframes pulse-ring {
            0%   { transform: scale(0.85); opacity: 1; }
            100% { transform: scale(1.5);  opacity: 0; }
          }
        `;
        document.head.appendChild(style);
      }

      // Vista fija por defecto: el campo COMPLETO al tamaño máximo que cabe
      // en pantalla (sin recortar los extremos).
      const fitToCourse = () => {
        map.invalidateSize();
        const bounds = holesLayer.getBounds();
        map.fitBounds(bounds, { padding: [8, 8], animate: false });
      };
      fitToCourse();
      // Si arranca con un grupo ya seleccionado, hacemos zoom a él.
      if (selectedId) {
        const g = groups.find((x) => x.id === selectedId);
        if (g) map.setView([g.lat, g.lon], 19, { animate: false });
      }

      cleanup = () => {
        mapRef.current = null;
        holesLayerRef.current = null;
        map.remove();
      };
    })();

    return () => cleanup();
  }, [size.w, size.h, groups]);

  // Reaccionar a selectedId: flyTo al grupo + zoom o volver a vista completa
  useEffect(() => {
    const map = mapRef.current;
    const holesLayer = holesLayerRef.current;
    if (!map || !holesLayer) return;
    if (selectedId) {
      const g = groups.find((x) => x.id === selectedId);
      if (g) {
        map.flyTo([g.lat, g.lon], 19, { duration: 0.8 });
      }
    } else {
      map.flyToBounds(holesLayer.getBounds(), { padding: [8, 8], duration: 0.8 });
    }
  }, [selectedId, groups]);

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height: "100%", overflow: "hidden", position: "relative", background: "#000" }}
    >
      {size.w > 0 && size.h > 0 && (
        rotate ? (
          <div
            ref={mapDivRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              // dimensiones invertidas: el map "cree" que es retrato
              width: size.h,
              height: size.w,
              // rotar -90deg, luego trasladar para que entre en el viewport
              transformOrigin: "0 0",
              transform: `translate(0, ${size.h}px) rotate(-90deg)`,
            }}
          />
        ) : (
          // Modo portrait: sin rotación, dimensiones naturales
          <div
            ref={mapDivRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size.w,
              height: size.h,
            }}
          />
        )
      )}
    </div>
  );
}
