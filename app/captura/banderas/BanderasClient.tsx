"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { addSatelliteLayers, loadLeaflet } from "@/components/captura/mapRotation";
import {
  computeFlagPosition,
  type FlagColor,
  type FlagSide,
} from "@/lib/flags/pinSheetGeometry";

interface Props {
  tg: string;
  keeperName: string;
  initialHole: number;
}

type LL = { lat: number; lon: number };
interface HoleData {
  greenCenter: LL | null;
  greenFront: LL | null;
  greenBack: LL | null;
  greenRing: LL[] | null;
  bunkerRings?: LL[][];
  flag: {
    lat: number;
    lon: number;
    color: string | null;
    side: string | null;
    depth_yards: number | null;
    edge_yards: number | null;
    valid_until: string | null;
  } | null;
}

type SatMap = {
  fitBounds: (bounds: unknown, opts?: { animate?: boolean }) => void;
  setView: (center: [number, number], zoom?: number) => void;
  panBy: (offset: [number, number], opts?: { animate?: boolean }) => void;
  latLngToContainerPoint: (latlng: [number, number]) => { x: number; y: number };
  getSize: () => { x: number; y: number };
  invalidateSize: () => void;
  remove: () => void;
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

function distanceMeters(a: LL, b: LL): number {
  const d = latLonToEN(a, b);
  return Math.hypot(d.e, d.n);
}

function centroid(points: LL[]): LL | null {
  if (!points.length) return null;
  let lat = 0;
  let lon = 0;
  for (const p of points) {
    lat += p.lat;
    lon += p.lon;
  }
  return { lat: lat / points.length, lon: lon / points.length };
}

const COLORS: { code: FlagColor; label: string; dot: string; zona: string }[] = [
  { code: "roja", label: "Roja", dot: "#ef4444", zona: "adelante" },
  { code: "blanca", label: "Blanca", dot: "#e5e7eb", zona: "medio" },
  { code: "azul", label: "Azul", dot: "#3b82f6", zona: "atrás" },
];

export default function BanderasClient({ tg, keeperName, initialHole }: Props) {
  const [hole, setHole] = useState<number>(initialHole);
  const [data, setData] = useState<HoleData | null>(null);
  const [color, setColor] = useState<FlagColor | null>(null);
  const [side, setSide] = useState<FlagSide | null>(null);
  const [depthYards, setDepthYards] = useState<string>("");
  const [edgeYards, setEdgeYards] = useState<string>("");
  const [validUntil, setValidUntil] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");
  const mapWrapRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<SatMap | null>(null);
  const layerRef = useRef<{ remove: () => void } | null>(null);
  const mapRotationDeg = useMemo(() => {
    if (!data?.greenFront || !data?.greenBack) return 0;
    const axis = latLonToEN(data.greenFront, data.greenBack);
    const norm = Math.hypot(axis.e, axis.n);
    if (norm < 0.1) return 0;

    const screenAngle = (Math.atan2(-axis.n, axis.e) * 180) / Math.PI;
    return -90 - screenAngle;
  }, [data?.greenFront, data?.greenBack]);

  const loadHole = useCallback(
    async (h: number) => {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(
          `/api/captura/banderas?tg=${encodeURIComponent(tg)}&hole=${h}`,
          { cache: "no-store" }
        );
        const d = (await res.json()) as HoleData & { ok: boolean; error?: string };
        if (!d.ok) {
          setMsg(d.error || "No pude cargar el hoyo.");
          setData(null);
          return;
        }
        setData({
          greenCenter: d.greenCenter,
          greenFront: d.greenFront,
          greenBack: d.greenBack,
          greenRing: d.greenRing,
          bunkerRings: Array.isArray(d.bunkerRings) ? d.bunkerRings : [],
          flag: d.flag,
        });
        // Precargar con la bandera vigente si existe.
        if (d.flag) {
          setColor((d.flag.color as FlagColor) ?? null);
          setSide((d.flag.side as FlagSide) ?? null);
          setDepthYards(d.flag.depth_yards != null ? String(d.flag.depth_yards) : "");
          setEdgeYards(d.flag.edge_yards != null ? String(d.flag.edge_yards) : "");
          setValidUntil(d.flag.valid_until ?? "");
        } else {
          setColor(null);
          setSide(null);
          setDepthYards("");
          setEdgeYards("");
          setValidUntil("");
        }
      } catch {
        setMsg("Error de red al cargar el hoyo.");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [tg]
  );

  useEffect(() => {
    void loadHole(hole);
  }, [hole, loadHole]);

  const depthNum = Number(depthYards);
  const edgeNum = Number(edgeYards);
  const inputsReady =
    !!color &&
    !!side &&
    Number.isFinite(depthNum) &&
    depthNum >= 0 &&
    Number.isFinite(edgeNum) &&
    edgeNum >= 0 &&
    depthYards.trim() !== "" &&
    edgeYards.trim() !== "";

  // Preview de la bandera con las yardas actuales.
  const previewFlag = useMemo(() => {
    if (!data?.greenFront || !data.greenBack || !data.greenCenter) return null;
    if (!inputsReady || !color || !side) return null;
    return computeFlagPosition(
      {
        front: data.greenFront,
        back: data.greenBack,
        center: data.greenCenter,
        ring: data.greenRing,
      },
      { color, side, depthYards: depthNum, edgeYards: edgeNum }
    );
  }, [data, inputsReady, color, side, depthNum, edgeNum]);

  const displayFlag = useMemo(
    () =>
      previewFlag ??
      (data?.flag ? { lat: data.flag.lat, lon: data.flag.lon } : null),
    [previewFlag, data?.flag]
  );

  const flagColorDot =
    COLORS.find((c) => c.code === color)?.dot ?? "#f59e0b";

  const escuadraGeo = useMemo(() => {
    if (!displayFlag || !data?.greenFront || !data?.greenBack) return null;
    const front = data.greenFront;
    const back = data.greenBack;
    const fb = latLonToEN(front, back);
    const norm = Math.hypot(fb.e, fb.n);
    if (norm < 0.1) return null;

    const axis = { e: fb.e / norm, n: fb.n / norm };
    const right = { e: axis.n, n: -axis.e };
    const left = { e: -axis.n, n: axis.e };

    const depthMeters = Math.max(0, (Number(depthYards) || 0) * YARD_M);
    const edgeMeters = Math.max(0, (Number(edgeYards) || 0) * YARD_M);
    const depthDir = color === "azul" ? axis : { e: -axis.e, n: -axis.n };
    const latDir = side === "right" ? right : left;

    const depthEdge = enToLatLon(displayFlag, depthDir.e * depthMeters, depthDir.n * depthMeters);
    const lateralEdge = enToLatLon(displayFlag, latDir.e * edgeMeters, latDir.n * edgeMeters);

    return {
      depthEdge,
      lateralEdge,
      labelPos: midpoint(midpoint(displayFlag, depthEdge), midpoint(displayFlag, lateralEdge)),
      labelText:
        depthYards.trim() && edgeYards.trim()
          ? `${depthYards.trim()} x ${edgeYards.trim()} yd`
          : depthYards.trim()
            ? `${depthYards.trim()} yd`
            : edgeYards.trim()
              ? `${edgeYards.trim()} yd`
              : null,
    };
  }, [displayFlag, data?.greenFront, data?.greenBack, color, side, depthYards, edgeYards]);

  useEffect(() => {
    const mapTarget = displayFlag ?? data?.greenCenter ?? data?.greenBack ?? data?.greenFront;
    if (!mapWrapRef.current || !mapTarget) return;

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

      // Encuadre estable: green + bunkers cercanos al green (no todo el hoyo).
      const fitPoints: LL[] = [mapTarget];
      const greenAnchor = data?.greenCenter ?? data?.greenBack ?? data?.greenFront ?? mapTarget;
      if (data?.greenRing && data.greenRing.length >= 3) {
        fitPoints.push(...data.greenRing);
      } else {
        if (data?.greenFront) fitPoints.push(data.greenFront);
        if (data?.greenBack) fitPoints.push(data.greenBack);
        if (data?.greenCenter) fitPoints.push(data.greenCenter);
      }

      const nearbyBunkers = (data?.bunkerRings ?? []).filter((ring) => {
        if (!Array.isArray(ring) || ring.length < 3) return false;
        const c = centroid(ring);
        if (!c) return false;
        // Solo trampas del entorno del green para no abrir el zoom de todo el hoyo.
        return distanceMeters(greenAnchor, c) <= 80;
      });
      for (const b of nearbyBunkers) {
        fitPoints.push(...b);
      }

      if (displayFlag) {
        const pin = L.circleMarker([displayFlag.lat, displayFlag.lon], {
          radius: 6,
          color: "#111827",
          weight: 1.5,
          fillColor: flagColorDot,
          fillOpacity: 1,
        }).addTo(fg);
        pin.bindTooltip("🚩", {
          permanent: true,
          direction: "top",
          offset: [0, -8],
          className: "!bg-black/75 !text-amber-100 !border !border-amber-300/40 !rounded px-1 py-0 text-[10px]",
        });
      }

      if (escuadraGeo) {
        L.polyline(
          [
            [escuadraGeo.depthEdge.lat, escuadraGeo.depthEdge.lon],
            [displayFlag.lat, displayFlag.lon],
            [escuadraGeo.lateralEdge.lat, escuadraGeo.lateralEdge.lon],
          ],
          { color: "#fbbf24", weight: 2.5 }
        ).addTo(fg);

        if (escuadraGeo.labelText) {
          L.marker([escuadraGeo.labelPos.lat, escuadraGeo.labelPos.lon], {
            icon: L.divIcon({
              className: "",
              html: `<div style=\"font-size:12px;font-weight:800;color:#fde68a;text-shadow:0 1px 3px rgba(0,0,0,.95);white-space:nowrap\">${escuadraGeo.labelText}</div>`,
            }),
          }).addTo(fg);
        }

      }

      if (fitPoints.length > 1) {
        const bounds = L.latLngBounds(fitPoints.map((p) => [p.lat, p.lon]));
        map.fitBounds(bounds.pad(0.16), { animate: false });
      } else {
        map.setView([mapTarget.lat, mapTarget.lon], 20);
      }

      // Alineacion fija para todos los hoyos: back/after arriba-centro.
      if (data?.greenBack) {
        const size = map.getSize();
        const cx = size.x / 2;
        const cy = size.y / 2;
        const targetX = cx;
        const targetY = Math.max(28, size.y * 0.12);
        const rad = (mapRotationDeg * Math.PI) / 180;
        const cos = Math.cos(rad);
        const sin = Math.sin(rad);

        for (let i = 0; i < 8; i++) {
          const p = map.latLngToContainerPoint([data.greenBack.lat, data.greenBack.lon]);
          const dx = p.x - cx;
          const dy = p.y - cy;
          const rx = cx + dx * cos - dy * sin;
          const ry = cy + dx * sin + dy * cos;
          const errX = targetX - rx;
          const errY = targetY - ry;
          if (Math.abs(errX) < 1 && Math.abs(errY) < 1) break;

          const ux = errX * cos + errY * sin;
          const uy = -errX * sin + errY * cos;
          map.panBy([-ux, -uy], { animate: false });
        }
      }

      map.invalidateSize();
    })();

    return () => {
      cancelled = true;
    };
  }, [
    displayFlag,
    data?.greenRing,
    data?.bunkerRings,
    data?.greenCenter,
    data?.greenFront,
    data?.greenBack,
    escuadraGeo,
    flagColorDot,
    mapRotationDeg,
  ]);

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

  const save = useCallback(async () => {
    if (!inputsReady || !color || !side) {
      setMsg("Elige color, lado y las 2 yardas.");
      return;
    }
    setSaving(true);
    setMsg("");
    try {
      const res = await fetch(`/api/captura/banderas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg,
          hole,
          color,
          side,
          depth_yards: depthNum,
          edge_yards: edgeNum,
          valid_until: validUntil || null,
        }),
      });
      const d = (await res.json()) as { ok: boolean; error?: string };
      if (d.ok) {
        setMsg(`✅ Bandera del hoyo ${hole} guardada.`);
        void loadHole(hole);
      } else {
        setMsg(d.error || "No pude guardar.");
      }
    } catch {
      setMsg("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  }, [inputsReady, color, side, tg, hole, depthNum, edgeNum, validUntil, loadHole]);

  const prev = () => setHole((h) => (h <= 1 ? 18 : h - 1));
  const next = () => setHole((h) => (h >= 18 ? 1 : h + 1));

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-amber-200">
            🚩 Banderas — {keeperName}
          </div>
          <div className="text-[11px] text-slate-400">Captura por yardas</div>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs">
          Salir
        </Link>
      </header>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button onClick={prev} className="rounded-md bg-slate-800 px-3 py-2 text-lg font-bold" aria-label="Hoyo anterior">‹</button>
        <div className="text-center">
          <div className="text-xs text-slate-400">Hoyo</div>
          <div className="text-2xl font-black tabular-nums">{hole}</div>
          <div className="text-[11px] text-slate-400">{data?.flag ? "Registrada" : "Sin registrar"}</div>
        </div>
        <button onClick={next} className="rounded-md bg-slate-800 px-3 py-2 text-lg font-bold" aria-label="Siguiente hoyo">›</button>
      </div>

      {/* Vista satélite del green (con trampas calibradas) */}
      <div className="flex justify-center px-0 sm:px-3">
        <div className="w-full max-w-none overflow-hidden rounded-none border-y border-emerald-400/40 sm:max-w-[360px] sm:rounded-xl sm:border">
            <div style={{ transform: `rotate(${mapRotationDeg}deg)`, transformOrigin: "center center" }}>
              <div
                ref={mapWrapRef}
                className="h-[56vh] min-h-[430px] w-full sm:h-[390px]"
                role="img"
                aria-label="Foto satélite del green con trampas y escuadra de bandera"
              />
            </div>
          <div className="flex items-center justify-between px-1 py-1 text-[10px] font-bold text-slate-300 sm:px-2">
            <span>FRENTE (entrada)</span>
            <span>ATRÁS</span>
          </div>
        </div>
      </div>

      <div className="space-y-3 px-3 py-2">
        {/* Color */}
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-300">Color de bandera (zona)</div>
          <div className="grid grid-cols-3 gap-2">
            {COLORS.map((c) => (
              <button
                key={c.code}
                onClick={() => setColor(c.code)}
                className={[
                  "rounded-lg border px-2 py-2 text-xs font-black",
                  color === c.code ? "border-amber-400 ring-2 ring-amber-400/70" : "border-slate-700",
                ].join(" ")}
              >
                <span className="mr-1 inline-block h-3 w-3 rounded-full align-middle" style={{ background: c.dot }} />
                {c.label}
                <div className="text-[9px] font-normal text-slate-400">{c.zona}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Lado */}
        <div>
          <div className="mb-1 text-xs font-semibold text-slate-300">Lado (respecto al centro)</div>
          <div className="grid grid-cols-2 gap-2">
            {([["left", "Izquierda"], ["right", "Derecha"]] as const).map(([code, label]) => (
              <button
                key={code}
                onClick={() => setSide(code)}
                className={[
                  "rounded-lg border px-2 py-2 text-xs font-black",
                  side === code ? "border-amber-400 ring-2 ring-amber-400/70" : "border-slate-700",
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Yardas */}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-slate-300">
            {color === "azul" ? "Yds desde ATRÁS" : "Yds desde el FRENTE"}
            <input
              type="number"
              inputMode="decimal"
              value={depthYards}
              onChange={(e) => setDepthYards(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-base"
              placeholder="ej. 8"
            />
          </label>
          <label className="text-xs text-slate-300">
            Yds a la orilla {side === "left" ? "izq" : side === "right" ? "der" : ""}
            <input
              type="number"
              inputMode="decimal"
              value={edgeYards}
              onChange={(e) => setEdgeYards(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-700 bg-slate-900 px-2 py-2 text-base"
              placeholder="ej. 4"
            />
          </label>
        </div>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-300">
          <span>Válida hasta (opcional):</span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {msg && <div className="px-3 pb-1 text-center text-sm text-amber-200">{msg}</div>}
      {loading && <div className="px-3 pb-1 text-center text-xs text-slate-400">Cargando hoyo {hole}…</div>}

      <div className="border-t border-slate-800 px-3 py-3">
        <button
          onClick={save}
          disabled={saving || !inputsReady}
          className="w-full rounded-lg bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-40"
        >
          {saving ? "Guardando…" : `Guardar bandera del hoyo ${hole}`}
        </button>
      </div>
    </div>
  );
}
