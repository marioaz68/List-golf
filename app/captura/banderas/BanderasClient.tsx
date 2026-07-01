"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- Leaflet se carga por CDN sin tipos (igual que SimpleCalibrarMap). */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addSatelliteLayers, loadLeaflet } from "@/components/captura/mapRotation";

interface Props {
  tg: string;
  keeperName: string;
  initialHole: number;
}

interface HoleData {
  greenCenter: { lat: number; lon: number } | null;
  flag: {
    lat: number;
    lon: number;
    source: string;
    effective_date: string;
    valid_until: string | null;
  } | null;
}

const DEFAULT_CENTER: [number, number] = [20.5625, -100.4078];

export default function BanderasClient({ tg, keeperName, initialHole }: Props) {
  const [hole, setHole] = useState<number>(initialHole);
  const [pos, setPos] = useState<{ lat: number; lon: number } | null>(null);
  const [info, setInfo] = useState<HoleData | null>(null);
  const [validUntil, setValidUntil] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Inicializa el mapa una sola vez.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(containerRef.current, {
        center: DEFAULT_CENTER,
        zoom: 19,
        maxZoom: 21,
        zoomControl: true,
        attributionControl: false,
      });
      addSatelliteLayers(map, L);
      mapRef.current = map;

      // Tocar el mapa también mueve la bandera (además de arrastrarla).
      map.on("click", (e: any) => {
        placeMarker(e.latlng.lat, e.latlng.lng);
        setPos({ lat: e.latlng.lat, lon: e.latlng.lng });
      });
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const placeMarker = useCallback((lat: number, lon: number) => {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (!markerRef.current) {
      const icon = L.divIcon({
        className: "",
        html: `<div style="font-size:30px;line-height:30px;transform:translate(-4px,-26px)">🚩</div>`,
        iconSize: [30, 30],
        iconAnchor: [4, 26],
      });
      const m = L.marker([lat, lon], { draggable: true, icon }).addTo(map);
      m.on("dragend", () => {
        const ll = m.getLatLng();
        setPos({ lat: ll.lat, lon: ll.lng });
      });
      markerRef.current = m;
    } else {
      markerRef.current.setLatLng([lat, lon]);
    }
  }, []);

  // Carga datos del hoyo y centra el mapa.
  const loadHole = useCallback(
    async (h: number) => {
      setLoading(true);
      setMsg("");
      try {
        const res = await fetch(
          `/api/captura/banderas?tg=${encodeURIComponent(tg)}&hole=${h}`,
          { cache: "no-store" }
        );
        const data = (await res.json()) as HoleData & { ok: boolean; error?: string };
        if (!data.ok) {
          setMsg(data.error || "No pude cargar el hoyo.");
          return;
        }
        setInfo({ greenCenter: data.greenCenter, flag: data.flag });
        setValidUntil(data.flag?.valid_until ?? "");
        const start = data.flag ?? data.greenCenter;
        const map = mapRef.current;
        if (start && map) {
          map.setView([start.lat, start.lon], 20);
          placeMarker(start.lat, start.lon);
          setPos({ lat: start.lat, lon: start.lon });
        } else {
          setPos(null);
          if (markerRef.current && map) {
            map.removeLayer(markerRef.current);
            markerRef.current = null;
          }
          setMsg("Este hoyo no tiene green calibrado todavía. Toca el mapa para colocar la bandera.");
        }
      } catch {
        setMsg("Error de red al cargar el hoyo.");
      } finally {
        setLoading(false);
      }
    },
    [tg, placeMarker]
  );

  // Recarga al cambiar de hoyo (espera a que el mapa exista).
  useEffect(() => {
    const t = setInterval(() => {
      if (mapRef.current) {
        clearInterval(t);
        loadHole(hole);
      }
    }, 150);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole]);

  const save = useCallback(async () => {
    if (!pos) {
      setMsg("Primero coloca la bandera en el mapa.");
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
          lat: pos.lat,
          lon: pos.lon,
          valid_until: validUntil || null,
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) {
        setMsg(`✅ Bandera del hoyo ${hole} guardada.`);
        setInfo((prev) =>
          prev
            ? {
                ...prev,
                flag: {
                  lat: pos.lat,
                  lon: pos.lon,
                  source: "map",
                  effective_date: "",
                  valid_until: validUntil || null,
                },
              }
            : prev
        );
      } else {
        setMsg(data.error || "No pude guardar.");
      }
    } catch {
      setMsg("Error de red al guardar.");
    } finally {
      setSaving(false);
    }
  }, [pos, tg, hole, validUntil]);

  const prev = () => setHole((h) => (h <= 1 ? 18 : h - 1));
  const next = () => setHole((h) => (h >= 18 ? 1 : h + 1));

  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-bold text-amber-200">
            🚩 Banderas — {keeperName}
          </div>
          <div className="text-xs text-slate-400">
            Arrastra o toca el mapa para ajustar el pin del green.
          </div>
        </div>
        <Link href="/" className="shrink-0 rounded-md border border-slate-700 px-2 py-1 text-xs">
          Salir
        </Link>
      </header>

      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <button
          onClick={prev}
          className="rounded-md bg-slate-800 px-3 py-2 text-lg font-bold"
          aria-label="Hoyo anterior"
        >
          ‹
        </button>
        <div className="text-center">
          <div className="text-xs text-slate-400">Hoyo</div>
          <div className="text-2xl font-black tabular-nums">{hole}</div>
          <div className="text-[11px] text-slate-400">
            {info?.flag ? "Bandera registrada" : "Sin registrar"}
          </div>
        </div>
        <button
          onClick={next}
          className="rounded-md bg-slate-800 px-3 py-2 text-lg font-bold"
          aria-label="Siguiente hoyo"
        >
          ›
        </button>
      </div>

      <div className="relative flex-1">
        <div ref={containerRef} className="absolute inset-0" />
        {loading && (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-xs">
            Cargando hoyo {hole}…
          </div>
        )}
      </div>

      {msg && (
        <div className="px-3 py-2 text-center text-sm text-amber-200">{msg}</div>
      )}

      <div className="border-t border-slate-800 px-3 py-3">
        <label className="mb-2 flex items-center justify-between gap-2 text-xs text-slate-300">
          <span>Válida hasta (opcional):</span>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-sm text-slate-100"
          />
        </label>
        <p className="mb-2 text-[11px] text-slate-500">
          Si la dejas vacía, vale hasta la próxima captura. Pasada la fecha sin
          recaptura, Yardas vuelve al centro del green.
        </p>
        {validUntil && (
          <button
            onClick={() => setValidUntil("")}
            className="mb-2 text-[11px] text-amber-300 underline"
          >
            Quitar fecha (vale hasta próxima captura)
          </button>
        )}
        <button
          onClick={save}
          disabled={saving || !pos}
          className="w-full rounded-lg bg-emerald-600 py-3 text-base font-bold text-white disabled:opacity-40"
        >
          {saving ? "Guardando…" : `Guardar bandera del hoyo ${hole}`}
        </button>
      </div>
    </div>
  );
}
