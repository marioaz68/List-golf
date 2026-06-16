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

export type SimpleCalibrarMode =
  | "green"
  | "boundary"
  | "fairway"
  | "centerline"
  | "bunker";

interface SimpleCalibrarMapProps {
  holeNo: number;
  mode: SimpleCalibrarMode;
  greenPoints: SimpleGreenPoint[];
  /** Contorno del hoyo (línea azul). */
  boundaryRing: LatLon[];
  /** Contorno del fairway (línea amarilla). Puede ir vacío si no se ha dibujado. */
  fairwayRing: LatLon[];
  /** Centro de fairway (línea naranja ABIERTA salida→green) para orientar Yardas. */
  centerlineRing: LatLon[];
  /** Bunkers del hoyo (varios polígonos). En modo "bunker" se edita el activo. */
  bunkers?: LatLon[][];
  /** Índice del bunker activo (editable) dentro de `bunkers`. */
  activeBunkerIndex?: number | null;
  /** Modo "agregar tocando": los puntos no interceptan el toque para que cada
   *  tap del mapa agregue el siguiente punto del contorno. */
  addingCorner?: boolean;
  selectedGreen?: SimpleGreenKey | null;
  /** Índice del vértice seleccionado dentro del contorno ACTIVO (según mode). */
  selectedVertex?: number | null;
  onGreenMove: (key: SimpleGreenKey, lat: number, lon: number) => void;
  onVertexMove: (index: number, lat: number, lon: number) => void;
  /** Tocar un vértice lo selecciona (para luego borrarlo o ajustarlo). */
  onVertexSelect?: (index: number) => void;
  /** Al trazar fairway: tocar el primer punto cierra el polígono. */
  onCloseRing?: () => void;
  onMapTap: (lat: number, lon: number) => void;
}

const COLORS = {
  boundary: { line: "#22d3ee", fill: "#0891b2" },
  fairway: { line: "#facc15", fill: "#ca8a04" },
  centerline: { line: "#fb923c", fill: "#ea580c" },
  bunker: { line: "#f5deb3", fill: "#e3c789" },
};

export function SimpleCalibrarMap({
  holeNo,
  mode,
  greenPoints,
  boundaryRing,
  fairwayRing,
  centerlineRing,
  bunkers = [],
  activeBunkerIndex = null,
  addingCorner = false,
  selectedGreen = null,
  selectedVertex = null,
  onGreenMove,
  onVertexMove,
  onVertexSelect,
  onCloseRing,
  onMapTap,
}: SimpleCalibrarMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const onGreenMoveRef = useRef(onGreenMove);
  const onVertexMoveRef = useRef(onVertexMove);
  const onVertexSelectRef = useRef(onVertexSelect);
  const onCloseRingRef = useRef(onCloseRing);
  const onMapTapRef = useRef(onMapTap);
  const dragLockRef = useRef(false);
  const framedKeyRef = useRef("");

  onGreenMoveRef.current = onGreenMove;
  onVertexMoveRef.current = onVertexMove;
  onVertexSelectRef.current = onVertexSelect;
  onCloseRingRef.current = onCloseRing;
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
    const activeBunker =
      mode === "bunker" && activeBunkerIndex != null
        ? (bunkers[activeBunkerIndex] ?? [])
        : [];
    const editRing =
      mode === "boundary"
        ? boundaryRing
        : mode === "fairway"
          ? fairwayRing
          : mode === "centerline"
            ? centerlineRing
            : mode === "bunker"
              ? activeBunker
              : [];
    const editColor =
      mode === "fairway"
        ? COLORS.fairway.line
        : mode === "centerline"
          ? COLORS.centerline.line
          : mode === "bunker"
            ? COLORS.bunker.line
            : COLORS.boundary.line;
    const isRing =
      mode === "boundary" || mode === "fairway" || mode === "bunker";
    const isLine = mode === "centerline";
    const editable = isRing || isLine;

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

      // Bunkers (varios polígonos, color arena). El activo se dibuja con sus
      // vértices editables abajo; los demás quedan como relleno estático.
      const tracingBunker = mode === "bunker" && addingCorner;
      for (let bi = 0; bi < bunkers.length; bi++) {
        const ring = bunkers[bi];
        if (!ring || ring.length < 3) continue;
        const isActive = mode === "bunker" && bi === activeBunkerIndex;
        // El bunker activo en trazado se dibuja como línea abierta (abajo), no
        // como polígono cerrado, hasta que el usuario cierre tocando el punto 1.
        if (isActive && tracingBunker) continue;
        const bFeature = polygonFromRing(holeNo, ring);
        L.geoJSON(bFeature, {
          style: {
            color: COLORS.bunker.line,
            weight: isActive ? 4 : 2,
            opacity: mode === "bunker" ? (isActive ? 1 : 0.7) : 0.55,
            fillColor: COLORS.bunker.fill,
            fillOpacity: isActive ? 0.4 : 0.28,
          },
          interactive: false,
        }).addTo(lg);
      }

      // Fairway amarillo CERRADO (polígono). Mientras trazas (modo "agregar
      // tocando") NO se dibuja el cierre: el usuario toca el punto 1 para cerrar.
      const tracingFairway = mode === "fairway" && addingCorner;
      const canCloseRing =
        (tracingFairway && fairwayRing.length >= 3) ||
        (tracingBunker && editRing.length >= 3);
      if (fairwayRing.length >= 3 && !tracingFairway) {
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

      // Centro de fairway (línea naranja ABIERTA salida→green). Siempre visible;
      // tenue si no se está editando.
      if (centerlineRing.length >= 2) {
        const pts = centerlineRing.map((v) => [v.lat, v.lon] as [number, number]);
        L.polyline(pts, {
          color: COLORS.centerline.line,
          weight: mode === "centerline" ? 4 : 2,
          opacity: mode === "centerline" ? 1 : 0.5,
          interactive: false,
        }).addTo(lg);
      }

      // Línea conectora del contorno activo: se ve crecer desde el 2º punto,
      // antes de que el polígono (3+ puntos) tenga relleno. (No para centerline,
      // que ya se dibuja arriba como línea abierta.)
      if (isRing && editRing.length >= 2) {
        const pts = editRing.map((v) => [v.lat, v.lon] as [number, number]);
        L.polyline(pts, {
          color: editColor,
          weight: 3,
          opacity: 0.95,
          dashArray: editRing.length >= 3 ? undefined : "6,6",
          interactive: false,
        }).addTo(lg);
        // Pista de cierre: línea punteada del último al primero (fairway/bunker).
        if (canCloseRing && editRing.length >= 3) {
          const first = editRing[0];
          const last = editRing[editRing.length - 1];
          L.polyline(
            [
              [last.lat, last.lon],
              [first.lat, first.lon],
            ],
            {
              color: editColor,
              weight: 2,
              opacity: 0.55,
              dashArray: "8,8",
              interactive: false,
            }
          ).addTo(lg);
        }
      }

      // Vértices del contorno/línea activos. Usan la misma mira (cruz + círculo)
      // que el green: más precisa que un cuadro.
      //  - En modo "agregar tocando" los puntos NO interceptan el toque
      //    (interactive:false) para que cada tap agregue el siguiente punto.
      //  - Fuera de ese modo son arrastrables y se seleccionan al tocarlos.
      if (editable) {
        for (let i = 0; i < editRing.length; i++) {
          const v = editRing[i];
          const selected = selectedVertex === i;
          const isCloseTarget = canCloseRing && i === 0;
          // Bunker: área de toque pequeña en el punto 1 para no robar taps al mapa.
          const tightCloseHit =
            isCloseTarget && mode === "bunker" && addingCorner;
          const dot = isCloseTarget ? (tightCloseHit ? 14 : 18) : selected ? 16 : 11;
          const arm = dot + 14;
          const ringColor = isCloseTarget
            ? "#fbbf24"
            : selected
              ? "#fb7185"
              : "#fff";
          const box = tightCloseHit ? 24 : 56;
          const c = box / 2;
          // Al trazar, solo el punto 1 es tocable (cerrar). El resto no intercepta.
          const vertexInteractive =
            !addingCorner || isCloseTarget;
          const marker = L.marker([v.lat, v.lon], {
            draggable: !addingCorner,
            interactive: vertexInteractive,
            icon: L.divIcon({
              className: "",
              html: `<div style="position:relative;width:${box}px;height:${box}px;overflow:visible;${vertexInteractive && !tightCloseHit ? "" : "pointer-events:none;"}touch-action:none;">
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:2px;height:${arm}px;background:${ringColor};opacity:0.95;pointer-events:none;"></div>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${arm}px;height:2px;background:${ringColor};opacity:0.95;pointer-events:none;"></div>
                <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:${dot}px;height:${dot}px;border-radius:50%;background:${editColor}dd;border:2px solid ${ringColor};box-shadow:0 1px 6px rgba(0,0,0,0.8);${isCloseTarget ? "box-shadow:0 0 0 4px rgba(251,191,36,0.55);" : ""}${tightCloseHit ? "pointer-events:auto;" : ""}"></div>
                ${isCloseTarget ? `<div style="position:absolute;top:calc(50% + ${dot / 2 + 6}px);left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fbbf24;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;font-family:Arial,sans-serif;white-space:nowrap;pointer-events:none;">Cerrar</div>` : ""}
              </div>`,
              iconSize: [box, box],
              iconAnchor: [c, c],
            }),
            zIndexOffset: isCloseTarget ? 950 : selected ? 900 : 800,
          }).addTo(lg);
          if (vertexInteractive) {
            marker.on("click", () => {
              if (isCloseTarget) {
                onCloseRingRef.current?.();
              } else {
                onVertexSelectRef.current?.(i);
              }
            });
            if (!addingCorner) {
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
        } else if (mode === "centerline" && centerlineRing.length >= 2) {
          const cb = L.latLngBounds(
            centerlineRing.map((v) => [v.lat, v.lon] as [number, number])
          );
          map.fitBounds(cb, { padding: [40, 40], maxZoom: 19, animate: false });
        } else if (mode === "bunker") {
          // Encuadra todo el hoyo para ver/colocar bunkers en cualquier parte.
          if (holeFeature) {
            const bounds = L.geoJSON(holeFeature).getBounds();
            for (const ring of bunkers)
              for (const v of ring) bounds.extend([v.lat, v.lon]);
            map.fitBounds(bounds, { padding: [24, 24], maxZoom: 20, animate: false });
          }
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
    centerlineRing,
    bunkers,
    activeBunkerIndex,
    addingCorner,
    selectedGreen,
    selectedVertex,
  ]);

  return <div ref={containerRef} className="absolute inset-0 bg-black" />;
}
