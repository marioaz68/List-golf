"use client";

import { useEffect, useRef, useState } from "react";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";

export interface GroupDot {
  id: string;
  number: number;
  lat: number;
  lon: number;
  hoyo: number;
  status: "en_ritmo" | "adelantado" | "atrasado" | "sin_datos" | "cerrado";
  label: string;
  detail?: string;
  role?: "normal" | "blocker" | "blocked";
  blockedBy?: number;
  /** gps = Live Location; capture = posición por hoyo capturado. */
  positionSource?: "gps" | "capture";
}

export interface MarshalDot {
  id: string;
  lat: number;
  lon: number;
  initials: string;
  name: string;
  hoyo: number | null;
  updatedAt: string | null;
}

/** Ruta del día de un marshal (línea sobre el campo). */
export interface MarshalTrailPath {
  id: string;
  color: string;
  /** Si false, se dibuja tenue (marshal no seleccionado). */
  active?: boolean;
  points: Array<{ lat: number; lon: number }>;
}

interface RitmoMapProps {
  groups: GroupDot[];
  marshals?: MarshalDot[];
  /** Trazos GPS del día (reporte marshals). */
  trails?: MarshalTrailPath[];
  selectedId?: string | null;
  /** Etiquetas fijas H1–H18 del campo (no son grupos). Default false en vivo. */
  showHoleLabels?: boolean;
  /** Si true, rota el mapa 90° (mejor para landscape). Default true. */
  rotate?: boolean;
  /** Al tocar la bola de un grupo en el mapa. El padre decide alternar
   *  (mismo id → null para volver a vista completa). */
  onSelectGroup?: (id: string) => void;
}

const STATUS_COLOR: Record<GroupDot["status"], string> = {
  en_ritmo: "#10b981",
  adelantado: "#3b82f6",
  atrasado: "#ef4444",
  sin_datos: "#6b7280",
  cerrado: "#64748b",
};
const BLOCKED_COLOR = "#f59e0b"; // amarillo/naranja para "víctimas"

const HOYO_COLORS = [
  "#FF1744","#00E676","#FFEA00","#2979FF","#FF9100","#D500F9",
  "#00E5FF","#F50057","#76FF03","#FF80AB","#1DE9B6","#B388FF",
  "#FFAB40","#EEFF41","#FF6E40","#69F0AE","#FFFF8D","#FFD180",
];

type SpiderfyItem = { key: string; lat: number; lon: number };

/**
 * Abre en abanico los puntos que a este zoom se ven encimados.
 * Solo mueve posición (mismo tamaño de bola); radio en px del mapa
 * para que en vista completa se distingan sin agrandar iconos.
 */
function spiderfyOnMap(
  map: {
    latLngToLayerPoint: (ll: [number, number]) => { x: number; y: number };
    layerPointToLatLng: (p: { x: number; y: number }) => {
      lat: number;
      lng: number;
    };
  },
  items: SpiderfyItem[],
  /** Distancia en px para considerar “encimados” (≈ tamaño del marshal). */
  overlapPx = 18,
  /** Radio del abanico en px: justo para no solaparse, sin abrir mucho. */
  baseRadiusPx = 16
): Array<
  SpiderfyItem & {
    displayLat: number;
    displayLon: number;
    /** true si se movió respecto al GPS real. */
    offset: boolean;
  }
> {
  if (items.length === 0) return [];

  const pts = items.map((it, i) => {
    const p = map.latLngToLayerPoint([it.lat, it.lon]);
    return { i, x: p.x, y: p.y };
  });

  const used = new Set<number>();
  const clusters: number[][] = [];

  for (let i = 0; i < pts.length; i++) {
    if (used.has(i)) continue;
    const cluster = [i];
    used.add(i);
    for (let qi = 0; qi < cluster.length; qi++) {
      const a = pts[cluster[qi]]!;
      for (let j = 0; j < pts.length; j++) {
        if (used.has(j)) continue;
        const b = pts[j]!;
        if (Math.hypot(a.x - b.x, a.y - b.y) <= overlapPx) {
          used.add(j);
          cluster.push(j);
        }
      }
    }
    clusters.push(cluster);
  }

  const out: Array<
    SpiderfyItem & {
      displayLat: number;
      displayLon: number;
      offset: boolean;
    }
  > = [];

  for (const idxs of clusters) {
    if (idxs.length === 1) {
      const it = items[idxs[0]!]!;
      out.push({
        ...it,
        displayLat: it.lat,
        displayLon: it.lon,
        offset: false,
      });
      continue;
    }
    const n = idxs.length;
    const cx = idxs.reduce((s, i) => s + pts[i]!.x, 0) / n;
    const cy = idxs.reduce((s, i) => s + pts[i]!.y, 0) / n;
    // Separación mínima entre centros ≈ tamaño bola; no abrir de más.
    const radiusPx = baseRadiusPx + Math.max(0, n - 2) * 3;
    for (let k = 0; k < n; k++) {
      const it = items[idxs[k]!]!;
      const angle = (2 * Math.PI * k) / n - Math.PI / 2;
      const x = cx + radiusPx * Math.cos(angle);
      const y = cy + radiusPx * Math.sin(angle);
      const ll = map.layerPointToLatLng({ x, y });
      out.push({
        ...it,
        displayLat: ll.lat,
        displayLon: ll.lng,
        offset: true,
      });
    }
  }
  return out;
}

/**
 * Mapa rotado 90° con CSS para que el eje largo del campo quede horizontal
 * y aproveche mejor la pantalla landscape. El contenido visible (markers,
 * etiquetas) se contra-rotan para que el texto siga legible.
 */
export function RitmoMap({
  groups,
  marshals = [],
  trails = [],
  selectedId,
  showHoleLabels = true,
  rotate = true,
  onSelectGroup,
}: RitmoMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const holesLayerRef = useRef<any>(null);
  const redrawRef = useRef<() => void>(() => {});
  const [size, setSize] = useState({ w: 0, h: 0 });

  // Datos siempre frescos sin remount del mapa (el remount perdía marshals).
  const groupsRef = useRef(groups);
  const marshalsRef = useRef(marshals);
  const trailsRef = useRef(trails);
  groupsRef.current = groups;
  marshalsRef.current = marshals;
  trailsRef.current = trails;

  const onSelectGroupRef = useRef<RitmoMapProps["onSelectGroup"]>(undefined);
  onSelectGroupRef.current = onSelectGroup;

  /** Botones HTML encima del mapa (coordenadas de pantalla). Con CSS
   *  rotate(-90deg) Leaflet no acierta el tap; el overlay sí. */
  const [hitTargets, setHitTargets] = useState<
    Array<{ id: string; number: number; left: number; top: number }>
  >([]);
  const rotateRef = useRef(rotate);
  rotateRef.current = rotate;
  const sizeRef = useRef(size);
  sizeRef.current = size;

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Solo reinicia Leaflet al cambiar tamaño / rotación / etiquetas.
  useEffect(() => {
    if (!mapDivRef.current || size.w === 0 || size.h === 0) return;
    let cancelled = false;
    let cleanup = () => {};

    (async () => {
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
      if (cancelled || !mapDivRef.current) return;
      const L = (window as any).L;

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

      L.tileLayer(
        "https://mt{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
        { subdomains: ["0", "1", "2", "3"], maxZoom: 21, maxNativeZoom: 20, attribution: "© Google" }
      ).addTo(map);

      const holesLayer = L.geoJSON(CCQ_HOLES, {
        style: () => ({ opacity: 0, fillOpacity: 0, weight: 0 }),
      });
      holesLayerRef.current = holesLayer;
      mapRef.current = map;

      if (showHoleLabels) {
        CCQ_HOLES.features.forEach((f: any) => {
          const center = L.geoJSON(f).getBounds().getCenter();
          L.marker(center, {
            icon: L.divIcon({
              className: "ritmo-dot-icon",
              html: `<div style="transform: ${rotate ? "rotate(90deg)" : "none"}; transform-origin: center;">
              <div style="background:rgba(0,0,0,0.45);color:#cbd5e1;border:1px solid ${HOYO_COLORS[(f.properties.hoyo - 1) % HOYO_COLORS.length]};padding:0 5px;border-radius:8px;font-weight:600;font-size:9px;font-family:Arial,sans-serif;display:inline-block;opacity:0.85;">${f.properties.hoyo}</div>
            </div>`,
              iconSize: [22, 16],
              iconAnchor: [11, 8],
            }),
            interactive: false,
          }).addTo(map);
        });
      }

      const DOT = 16;
      const DOT_BORDER = 2;
      const DOT_FONT = 9;
      const RING = 22;
      const RING_OFF = Math.round((RING - DOT) / 2);
      // Marshals más grandes que grupos para distinguirlos en desktop.
      const M_DOT = 22;
      const M_BORDER = 2;
      const M_FONT = 9;

      type PlotPt =
        | { kind: "group"; key: string; lat: number; lon: number; g: GroupDot }
        | {
            kind: "marshal";
            key: string;
            lat: number;
            lon: number;
            m: MarshalDot;
          };

      const dotsLayer = L.layerGroup().addTo(map);
      const trailsLayer = L.layerGroup().addTo(map);
      let zoomRedrawTimer: number | null = null;

      const renderTrails = () => {
        trailsLayer.clearLayers();
        for (const trail of trailsRef.current) {
          if (!trail.points || trail.points.length < 2) continue;
          const active = trail.active !== false;
          const latlngs = trail.points.map((p) => [p.lat, p.lon]);
          L.polyline(latlngs, {
            color: trail.color,
            weight: active ? 3 : 1.5,
            opacity: active ? 0.9 : 0.25,
            interactive: false,
          }).addTo(trailsLayer);
          const last = trail.points[trail.points.length - 1]!;
          const first = trail.points[0]!;
          L.circleMarker([first.lat, first.lon], {
            radius: active ? 3 : 2,
            color: "#fff",
            weight: 1,
            fillColor: trail.color,
            fillOpacity: active ? 0.95 : 0.4,
            interactive: false,
          }).addTo(trailsLayer);
          L.circleMarker([last.lat, last.lon], {
            radius: active ? 4 : 2,
            color: "#fff",
            weight: 1,
            fillColor: trail.color,
            fillOpacity: active ? 1 : 0.4,
            interactive: false,
          }).addTo(trailsLayer);
        }
      };

      const renderDots = () => {
        const liveGroups = groupsRef.current;
        const liveMarshals = marshalsRef.current;
        dotsLayer.clearLayers();
        const nextHits: Array<{
          id: string;
          number: number;
          left: number;
          top: number;
        }> = [];

        const plotPts: PlotPt[] = [
          ...liveGroups.map((g) => ({
            kind: "group" as const,
            key: `g:${g.id}`,
            lat: g.lat,
            lon: g.lon,
            g,
          })),
          ...liveMarshals.map((m) => ({
            kind: "marshal" as const,
            key: `m:${m.id}`,
            lat: m.lat,
            lon: m.lon,
            m,
          })),
        ];

        const spread = spiderfyOnMap(map, plotPts, 22, 18);
        const byKey = new Map(spread.map((p) => [p.key, p]));

        for (const p of spread) {
          if (!p.offset) continue;
          L.polyline(
            [
              [p.lat, p.lon],
              [p.displayLat, p.displayLon],
            ],
            {
              color: "#93c5fd",
              weight: 1,
              opacity: 0.7,
              interactive: false,
            }
          ).addTo(dotsLayer);
          L.circleMarker([p.lat, p.lon], {
            radius: 1.5,
            color: "#fff",
            weight: 1,
            fillColor: "#38bdf8",
            fillOpacity: 0.9,
            interactive: false,
          }).addTo(dotsLayer);
        }

        liveGroups.forEach((g) => {
          const isBlocker = g.role === "blocker";
          const isBlocked = g.role === "blocked";
          const fromCapture = g.positionSource === "capture";
          const color = isBlocked ? BLOCKED_COLOR : STATUS_COLOR[g.status];
          const ring = isBlocker
            ? `<div style="
                position:absolute; left:-${RING_OFF}px; top:-${RING_OFF}px;
                width:${RING}px; height:${RING}px; border-radius:50%;
                border:1px solid ${color};
                animation: pulse-ring 1.5s ease-out infinite;
                pointer-events:none;
              "></div>`
            : "";
          const blockerIcon = isBlocker
            ? `<div style="position:absolute; left:9px; top:-8px; font-size:7px;">🚦</div>`
            : "";
          const captureRing = fromCapture
            ? `box-shadow:0 0 0 1px rgba(255,255,255,0.95), 0 0 0 2px rgba(59,130,246,0.85);`
            : "box-shadow:0 1px 3px rgba(0,0,0,0.7);";

          const sp = byKey.get(`g:${g.id}`);
          const pos = sp
            ? { lat: sp.displayLat, lon: sp.displayLon }
            : { lat: g.lat, lon: g.lon };
          const marker = L.marker([pos.lat, pos.lon], {
            icon: L.divIcon({
              className: "ritmo-dot-icon",
              html: `
              <div style="transform: ${rotate ? "rotate(90deg)" : "none"}; transform-origin: center; position: relative; cursor: pointer;">
                ${ring}
                <div style="
                  width:${DOT}px; height:${DOT}px; border-radius:50%;
                  background:${color};
                  border:${DOT_BORDER}px ${fromCapture ? "dashed" : "solid"} #fff;
                  ${captureRing}
                  display:flex; align-items:center; justify-content:center;
                  color:#fff; font-weight:800; font-size:${DOT_FONT}px;
                  font-family:Arial,sans-serif;
                  letter-spacing:-0.5px;
                ">${g.number}</div>
                ${blockerIcon}
              </div>
            `,
              iconSize: [DOT, DOT],
              iconAnchor: [DOT / 2, DOT / 2],
            }),
            keyboard: false,
            interactive: false,
            zIndexOffset: 400,
          }).addTo(dotsLayer);

          // Coordenadas de pantalla para el overlay táctil (compensa rotate CSS).
          const pt = map.latLngToContainerPoint([pos.lat, pos.lon]);
          const sz = sizeRef.current;
          const isRot = rotateRef.current;
          const screenLeft = isRot ? pt.y : pt.x;
          const screenTop = isRot ? sz.h - pt.x : pt.y;
          nextHits.push({
            id: g.id,
            number: g.number,
            left: screenLeft,
            top: screenTop,
          });
        });

        liveMarshals.forEach((m) => {
          const sp = byKey.get(`m:${m.id}`);
          const pos = sp
            ? { lat: sp.displayLat, lon: sp.displayLon }
            : { lat: m.lat, lon: m.lon };
          const safeName = m.name
            .replace(/&/g, "&amp;")
            .replace(/"/g, "&quot;")
            .replace(/</g, "&lt;");
          L.marker([pos.lat, pos.lon], {
            icon: L.divIcon({
              className: "ritmo-dot-icon",
              html: `
              <div style="transform: ${rotate ? "rotate(90deg)" : "none"}; transform-origin: center; position: relative;" title="${safeName}">
                <div style="
                  width:${M_DOT}px; height:${M_DOT}px; border-radius:50%;
                  background:#1d4ed8;
                  border:${M_BORDER}px solid #fff;
                  box-shadow:0 0 0 2px rgba(37,99,235,0.85), 0 2px 6px rgba(0,0,0,0.85);
                  display:flex; align-items:center; justify-content:center;
                  color:#fff; font-weight:900; font-size:${M_FONT}px;
                  font-family:Arial,sans-serif;
                  letter-spacing:-0.5px;
                ">${m.initials}</div>
              </div>
            `,
              iconSize: [M_DOT, M_DOT],
              iconAnchor: [M_DOT / 2, M_DOT / 2],
            }),
            keyboard: false,
            interactive: false,
            zIndexOffset: 900,
          }).addTo(dotsLayer);
        });

        setHitTargets(nextHits);
      };

      const redraw = () => {
        if (!mapRef.current) return;
        renderTrails();
        renderDots();
      };
      redrawRef.current = redraw;

      const scheduleRenderDots = () => {
        if (zoomRedrawTimer != null) window.clearTimeout(zoomRedrawTimer);
        zoomRedrawTimer = window.setTimeout(() => {
          zoomRedrawTimer = null;
          redraw();
        }, 80);
      };
      map.on("zoomend", scheduleRenderDots);
      map.on("moveend", scheduleRenderDots);

      if (!document.querySelector("style[data-ritmo-anim]")) {
        const style = document.createElement("style");
        style.setAttribute("data-ritmo-anim", "1");
        style.innerHTML = `
          @keyframes pulse-ring {
            0%   { transform: scale(0.85); opacity: 1; }
            100% { transform: scale(1.5);  opacity: 0; }
          }
          .ritmo-dot-icon {
            background: transparent !important;
            border: none !important;
            pointer-events: none !important;
          }
        `;
        document.head.appendChild(style);
      }

      const fitToCourse = () => {
        map.invalidateSize();
        const bounds = holesLayer.getBounds();
        map.fitBounds(bounds, { padding: [8, 8], animate: false });
      };
      fitToCourse();
      redraw();
      window.setTimeout(() => {
        if (!mapRef.current || cancelled) return;
        map.invalidateSize();
        fitToCourse();
        redraw();
      }, 300);

      cleanup = () => {
        if (zoomRedrawTimer != null) window.clearTimeout(zoomRedrawTimer);
        map.off("zoomend", scheduleRenderDots);
        map.off("moveend", scheduleRenderDots);
        if (redrawRef.current === redraw) redrawRef.current = () => {};
        mapRef.current = null;
        holesLayerRef.current = null;
        map.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [size.w, size.h, showHoleLabels, rotate]);

  // Actualizar bolas/trazos sin destruir el mapa.
  useEffect(() => {
    redrawRef.current();
  }, [groups, marshals, trails]);

  useEffect(() => {
    const map = mapRef.current;
    const holesLayer = holesLayerRef.current;
    if (!map || !holesLayer) return;
    if (selectedId) {
      const g = groupsRef.current.find((x) => x.id === selectedId);
      if (g) {
        map.flyTo([g.lat, g.lon], 19, { duration: 0.8 });
      }
    } else {
      map.flyToBounds(holesLayer.getBounds(), { padding: [8, 8], duration: 0.8 });
    }
  }, [selectedId]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
        background: "#000",
      }}
    >
      {size.w > 0 && size.h > 0 && (
        rotate ? (
          <div
            ref={mapDivRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size.h,
              height: size.w,
              transformOrigin: "0 0",
              transform: `translate(0, ${size.h}px) rotate(-90deg)`,
              // El mapa solo pinta; los taps van al overlay.
              pointerEvents: onSelectGroup ? "none" : "auto",
            }}
          />
        ) : (
          <div
            ref={mapDivRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: size.w,
              height: size.h,
              pointerEvents: onSelectGroup ? "none" : "auto",
            }}
          />
        )
      )}
      {onSelectGroup ? (
        <div
          role="presentation"
          aria-label="Toca un grupo numerado para capturas retrasadas"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const MAX_D = 56;
            let best: (typeof hitTargets)[number] | null = null;
            let bestD = MAX_D;
            for (const t of hitTargets) {
              const d = Math.hypot(t.left - x, t.top - y);
              if (d <= bestD) {
                bestD = d;
                best = t;
              }
            }
            if (best) onSelectGroupRef.current?.(best.id);
          }}
          onTouchEnd={(e) => {
            if (e.changedTouches.length === 0) return;
            const touch = e.changedTouches[0]!;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = touch.clientX - rect.left;
            const y = touch.clientY - rect.top;
            const MAX_D = 56;
            let best: (typeof hitTargets)[number] | null = null;
            let bestD = MAX_D;
            for (const t of hitTargets) {
              const d = Math.hypot(t.left - x, t.top - y);
              if (d <= bestD) {
                bestD = d;
                best = t;
              }
            }
            if (!best) return;
            e.preventDefault();
            onSelectGroupRef.current?.(best.id);
          }}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1300,
            cursor: hitTargets.length ? "pointer" : "default",
            background: "transparent",
            touchAction: "manipulation",
          }}
        />
      ) : null}
    </div>
  );
}
