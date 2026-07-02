"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addSatelliteLayers, loadLeaflet } from "@/components/captura/mapRotation";

interface Props {
  hole: number;
  courseId: string;
  onClose: () => void;
}

type LL = { lat: number; lon: number };
interface ViewData {
  greenCenter: LL | null;
  greenFront: LL | null;
  greenBack: LL | null;
  greenRing: LL[] | null;
  flag: {
    lat: number;
    lon: number;
    color: string | null;
    side: string | null;
    depth_yards: number | null;
    edge_yards: number | null;
  } | null;
}

type SatMap = {
  fitBounds: (bounds: unknown, opts?: { animate?: boolean }) => void;
  setView: (center: [number, number], zoom?: number) => void;
  invalidateSize: () => void;
  remove: () => void;
};

const COLOR_DOT: Record<string, string> = {
  roja: "#ef4444",
  blanca: "#e5e7eb",
  azul: "#3b82f6",
};

const YARD_M = 0.9144;
const M_PER_DEG_LAT = 111_320;

function metersPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

function latLonToEN(origin: LL, point: LL): { e: number; n: number } {
  const mLon = metersPerDegLon(origin.lat);
  return {
    e: (point.lon - origin.lon) * mLon,
    n: (point.lat - origin.lat) * M_PER_DEG_LAT,
  };
}

function enToLatLon(origin: LL, e: number, n: number): LL {
  const mLon = metersPerDegLon(origin.lat);
  return {
    lat: origin.lat + n / M_PER_DEG_LAT,
    lon: origin.lon + (mLon > 0 ? e / mLon : 0),
  };
}

function midpoint(a: LL, b: LL): LL {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
}

/** Hoja emergente que muestra la posición de la bandera del hoyo (referencia). */
export function FlagPositionSheet({ hole, courseId, onClose }: Props) {
  const [data, setData] = useState<ViewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string>("");
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<SatMap | null>(null);
  const layerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setErr("");
    (async () => {
      try {
        const res = await fetch(
          `/api/captura/banderas/view?hole=${hole}&course_id=${encodeURIComponent(courseId)}`,
          { cache: "no-store" }
        );
        const d = (await res.json()) as ViewData & { ok: boolean; error?: string };
        if (cancelled) return;
        if (!d.ok) {
          setErr(d.error || "No se pudo cargar.");
          setData(null);
        } else {
          setData(d);
        }
      } catch {
        if (!cancelled) setErr("Error de red.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hole, courseId]);

  const flag = data?.flag ?? null;
  const dot = flag?.color ? COLOR_DOT[flag.color] ?? "#f59e0b" : "#f59e0b";
  const flagPoint = useMemo(
    () => (flag ? { lat: flag.lat, lon: flag.lon } : null),
    [flag]
  );

  const escuadraGeo = useMemo(() => {
    if (!flag || !data?.greenFront || !data?.greenBack) return null;
    const front = data.greenFront;
    const back = data.greenBack;
    const f = { lat: flag.lat, lon: flag.lon };

    const fb = latLonToEN(front, back);
    const norm = Math.hypot(fb.e, fb.n);
    if (norm < 0.1) return null;

    const axis = { e: fb.e / norm, n: fb.n / norm }; // frente -> atras
    const right = { e: axis.n, n: -axis.e };
    const left = { e: -axis.n, n: axis.e };

    const depthMeters = Math.max(0, (flag.depth_yards ?? 0) * YARD_M);
    const edgeMeters = Math.max(0, (flag.edge_yards ?? 0) * YARD_M);

    const depthDir = flag.color === "azul" ? axis : { e: -axis.e, n: -axis.n };
    const latDir = flag.side === "right" ? right : left;

    const depthEdge = enToLatLon(f, depthDir.e * depthMeters, depthDir.n * depthMeters);
    const lateralEdge = enToLatLon(f, latDir.e * edgeMeters, latDir.n * edgeMeters);

    return {
      depthEdge,
      lateralEdge,
      depthLabel: flag.depth_yards != null ? `${flag.depth_yards} yd` : null,
      edgeLabel: flag.edge_yards != null ? `${flag.edge_yards} yd` : null,
      depthMid: midpoint(f, depthEdge),
      edgeMid: midpoint(f, lateralEdge),
    };
  }, [flag, data?.greenFront, data?.greenBack]);

  const refText = flag
    ? `${flag.color ? flag.color[0].toUpperCase() + flag.color.slice(1) : "Bandera"}` +
      (flag.depth_yards != null
        ? ` · ${flag.depth_yards} yds del ${flag.color === "azul" ? "fondo" : "frente"}`
        : "") +
      (flag.edge_yards != null && flag.side
        ? ` · ${flag.edge_yards} yds de orilla ${flag.side === "left" ? "izq" : "der"}`
        : "")
    : null;

  useEffect(() => {
    if (!mapWrapRef.current || !flagPoint) return;

    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !mapWrapRef.current) return;

      if (!mapRef.current) {
        mapRef.current = L.map(mapWrapRef.current, {
          zoomControl: false,
          attributionControl: false,
          dragging: false,
          touchZoom: false,
          doubleClickZoom: false,
          scrollWheelZoom: false,
          boxZoom: false,
          keyboard: false,
          tap: false,
        });
        addSatelliteLayers(mapRef.current, L);
      }

      const map = mapRef.current;
      if (!map) return;
      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
      const fg = L.featureGroup().addTo(map);
      layerRef.current = fg;

      const fitPoints: LL[] = [flagPoint];
      if (data?.greenRing && data.greenRing.length >= 3) {
        L.polygon(
          data.greenRing.map((p) => [p.lat, p.lon]),
          {
            color: "#4ade80",
            weight: 2,
            fillColor: "#22c55e",
            fillOpacity: 0.14,
          }
        ).addTo(fg);
        fitPoints.push(...data.greenRing);
      } else if (data?.greenCenter) {
        L.circle([data.greenCenter.lat, data.greenCenter.lon], {
          radius: 14,
          color: "#4ade80",
          weight: 2,
          fillColor: "#22c55e",
          fillOpacity: 0.14,
        }).addTo(fg);
        fitPoints.push(data.greenCenter);
      }

      const pin = L.circleMarker([flagPoint.lat, flagPoint.lon], {
        radius: 6,
        color: "#111827",
        weight: 1.5,
        fillColor: dot,
        fillOpacity: 1,
      }).addTo(fg);
      pin.bindTooltip("🚩", {
        permanent: true,
        direction: "top",
        offset: [0, -8],
        className: "!bg-black/75 !text-amber-100 !border !border-amber-300/40 !rounded px-1 py-0 text-[10px]",
      });

      if (escuadraGeo) {
        L.polyline(
          [
            [flagPoint.lat, flagPoint.lon],
            [escuadraGeo.depthEdge.lat, escuadraGeo.depthEdge.lon],
          ],
          { color: "#fbbf24", weight: 2, dashArray: "6 5" }
        ).addTo(fg);
        L.polyline(
          [
            [flagPoint.lat, flagPoint.lon],
            [escuadraGeo.lateralEdge.lat, escuadraGeo.lateralEdge.lon],
          ],
          { color: "#fbbf24", weight: 2, dashArray: "6 5" }
        ).addTo(fg);

        const sq = 2.8;
        const c = flagPoint;
        const d = escuadraGeo.depthEdge;
        const l = escuadraGeo.lateralEdge;
        const de = latLonToEN(c, d);
        const le = latLonToEN(c, l);
        const dn = Math.hypot(de.e, de.n) || 1;
        const ln = Math.hypot(le.e, le.n) || 1;
        const dp = { e: (de.e / dn) * sq, n: (de.n / dn) * sq };
        const lp = { e: (le.e / ln) * sq, n: (le.n / ln) * sq };
        const p1 = enToLatLon(c, lp.e, lp.n);
        const p2 = enToLatLon(c, lp.e + dp.e, lp.n + dp.n);
        const p3 = enToLatLon(c, dp.e, dp.n);
        L.polyline(
          [
            [p1.lat, p1.lon],
            [p2.lat, p2.lon],
            [p3.lat, p3.lon],
          ],
          { color: "#fde68a", weight: 2 }
        ).addTo(fg);

        if (escuadraGeo.depthLabel) {
          L.marker([escuadraGeo.depthMid.lat, escuadraGeo.depthMid.lon], {
            icon: L.divIcon({
              className: "",
              html: `<div style=\"font-size:11px;font-weight:700;color:#fde68a;text-shadow:0 1px 3px rgba(0,0,0,.95)\">${escuadraGeo.depthLabel}</div>`,
            }),
          }).addTo(fg);
        }
        if (escuadraGeo.edgeLabel) {
          L.marker([escuadraGeo.edgeMid.lat, escuadraGeo.edgeMid.lon], {
            icon: L.divIcon({
              className: "",
              html: `<div style=\"font-size:11px;font-weight:700;color:#fde68a;text-shadow:0 1px 3px rgba(0,0,0,.95)\">${escuadraGeo.edgeLabel}</div>`,
            }),
          }).addTo(fg);
        }

        fitPoints.push(escuadraGeo.depthEdge, escuadraGeo.lateralEdge);
      }

      if (fitPoints.length > 1) {
        const bounds = L.latLngBounds(fitPoints.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds.pad(0.45), { animate: false });
      } else {
        map.setView([flagPoint.lat, flagPoint.lon], 20);
      }
      map.invalidateSize();
    })();

    return () => {
      cancelled = true;
    };
  }, [flagPoint, data?.greenRing, data?.greenCenter, escuadraGeo, dot]);

  useEffect(() => {
    return () => {
      if (layerRef.current) {
        layerRef.current.remove();
        layerRef.current = null;
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-[1130] flex items-center justify-center bg-black/80 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border-2 border-amber-400/50 bg-slate-950 px-4 py-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-black text-amber-200">🚩 Bandera · Hoyo {hole}</p>
          <button onClick={onClose} className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-200">
            Cerrar
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
        ) : err ? (
          <p className="py-8 text-center text-sm text-amber-200">{err}</p>
        ) : !flag ? (
          <p className="py-8 text-center text-sm text-slate-300">
            Este hoyo aún no tiene bandera registrada hoy. Se usa el centro del green.
          </p>
        ) : (
          <>
            <div className="flex justify-center">
              <div className="w-full max-w-[260px]">
                <div
                  ref={mapWrapRef}
                  className="h-[320px] w-full overflow-hidden rounded-xl border border-emerald-400/40"
                  role="img"
                  aria-label="Foto satélite del green con posición de bandera y escuadra"
                />
                <div className="mt-1 flex items-center justify-between px-1 text-[10px] font-bold text-slate-300">
                  <span>FRENTE (entrada)</span>
                  <span>ATRÁS</span>
                </div>
              </div>
            </div>
            {refText ? (
              <p className="mt-2 text-center text-xs font-semibold text-amber-100">{refText}</p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
