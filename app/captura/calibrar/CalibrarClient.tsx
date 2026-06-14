"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import {
  computeAllHoleDistances,
  haversineMeters,
} from "@/lib/distances/ccqGreens";
import { CCQ_COURSE_ID } from "@/lib/distances/courseReferencePoints";
import { detectHole } from "@/lib/telegram/ritmo/geometry";
import { CCQ_HOLES } from "@/lib/telegram/ritmo/holes";
import type { CalibrarEditMode, CalibrarMarker } from "@/components/captura/CalibrarMap";
import {
  defaultHoleRing,
  parseBoundaryGeoJson,
  polygonFromRing,
  ringFromPolygon,
  type LatLon,
} from "@/lib/distances/holeBoundary";

const CalibrarMap = dynamic(
  () => import("@/components/captura/CalibrarMap").then((m) => m.CalibrarMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center bg-slate-900 text-sm text-slate-400">
        Cargando mapa…
      </div>
    ),
  }
);

type GeoState =
  | { status: "idle" }
  | { status: "requesting" }
  | { status: "denied"; message: string }
  | { status: "error"; message: string }
  | { status: "ok"; lat: number; lon: number; accuracy: number; ts: number };

interface GreenInfo {
  front: LatLon;
  center: LatLon;
  back: LatLon;
  saved: { front: boolean; center: boolean; back: boolean };
}

interface CustomPoint {
  id: string;
  label: string;
  short_label: string;
  kind: string;
  lat: number;
  lon: number;
}

const KIND_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "bunker", label: "Bunker", color: "#eab308" },
  { value: "water", label: "Agua", color: "#38bdf8" },
  { value: "dogleg", label: "Dogleg", color: "#a78bfa" },
  { value: "hazard", label: "Obstáculo", color: "#f97316" },
  { value: "other", label: "Otro", color: "#94a3b8" },
];

function kindColor(kind: string): string {
  return KIND_OPTIONS.find((k) => k.value === kind)?.color ?? "#94a3b8";
}

export default function CalibrarClient({ tg }: { tg: string }) {
  const searchParams = useSearchParams();
  const tgId = tg || searchParams.get("tg") || "";

  const [geo, setGeo] = useState<GeoState>({ status: "idle" });
  const [manualHole, setManualHole] = useState<number | null>(null);
  const [green, setGreen] = useState<GreenInfo | null>(null);
  const [points, setPoints] = useState<CustomPoint[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null
  );

  const [showAdd, setShowAdd] = useState(false);
  const [newKind, setNewKind] = useState("bunker");
  const [newLabel, setNewLabel] = useState("");
  const [newShort, setNewShort] = useState("");
  const [editMode, setEditMode] = useState<CalibrarEditMode>("off");
  const [boundaryRing, setBoundaryRing] = useState<LatLon[]>(() =>
    defaultHoleRing(1)
  );
  const [boundarySaved, setBoundarySaved] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  // Última posición aceptada: ignora el micro-jitter del GPS (1-2 m parado)
  // para que la foto no parpadee. Umbral pequeño (3 m) para no perder
  // precisión al calibrar.
  const lastPosRef = useRef<{ lat: number; lon: number } | null>(null);
  // Hoyo detectado cuando el usuario fijó el hoyo a mano; al entrar a otro
  // hoyo se reanuda el automático.
  const manualAtDetectedRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setGeo({ status: "error", message: "Este dispositivo no expone GPS." });
      return;
    }
    setGeo({ status: "requesting" });
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const last = lastPosRef.current;
        if (last && haversineMeters(last.lat, last.lon, lat, lon) < 3) {
          return;
        }
        lastPosRef.current = { lat, lon };
        setGeo({
          status: "ok",
          lat,
          lon,
          accuracy: pos.coords.accuracy ?? 0,
          ts: Date.now(),
        });
      },
      (err) => {
        if (err.code === 1) {
          setGeo({
            status: "denied",
            message: "Permiso de ubicación bloqueado. Habilita el GPS.",
          });
        } else {
          setGeo({ status: "error", message: err.message || "Error de GPS." });
        }
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 }
    );
    watchIdRef.current = id;
    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, []);

  const detectedHole = useMemo(() => {
    if (geo.status !== "ok") return null;
    return detectHole({ lat: geo.lat, lon: geo.lon }, CCQ_HOLES);
  }, [geo]);

  // Estricta: solo si estás DENTRO del polígono (para cambiar de hoyo).
  const insideHole = useMemo(() => {
    if (geo.status !== "ok") return null;
    return detectHole({ lat: geo.lat, lon: geo.lon }, CCQ_HOLES, 0);
  }, [geo]);

  const nearestHole = useMemo(() => {
    if (geo.status !== "ok") return 1;
    return computeAllHoleDistances(geo.lat, geo.lon)[0]?.holeNo ?? 1;
  }, [geo]);

  // Hoyo automático "pegajoso": no cambia hasta entrar DENTRO de otro hoyo
  // (2 lecturas seguidas). Evita brincos por ruido del GPS entre hoyos.
  const [autoHole, setAutoHole] = useState<number | null>(null);
  const autoCandidateRef = useRef<{ hole: number; count: number }>({
    hole: 0,
    count: 0,
  });
  useEffect(() => {
    if (geo.status !== "ok") return;
    setAutoHole((prev) => {
      if (prev == null) {
        autoCandidateRef.current = { hole: 0, count: 0 };
        return detectedHole ?? nearestHole;
      }
      if (insideHole == null || insideHole === prev) {
        autoCandidateRef.current = { hole: 0, count: 0 };
        return prev;
      }
      const cand = autoCandidateRef.current;
      if (cand.hole === insideHole) {
        cand.count += 1;
      } else {
        autoCandidateRef.current = { hole: insideHole, count: 1 };
      }
      if (autoCandidateRef.current.count >= 2) {
        autoCandidateRef.current = { hole: 0, count: 0 };
        return insideHole;
      }
      return prev;
    });
  }, [insideHole, detectedHole, nearestHole, geo.status]);

  const activeHole = manualHole ?? autoHole ?? nearestHole;

  useEffect(() => {
    if (
      manualHole != null &&
      insideHole != null &&
      insideHole !== manualAtDetectedRef.current
    ) {
      setManualHole(null);
    }
  }, [insideHole, manualHole]);

  const refetch = useCallback(async () => {
    try {
      const [gRes, pRes, bRes] = await Promise.all([
        fetch(
          `/api/captura/distancias/greens?hole=${activeHole}&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/distancias/points?hole=${activeHole}&course_id=${CCQ_COURSE_ID}`
        ),
        fetch(
          `/api/captura/distancias/boundary?hole=${activeHole}&course_id=${CCQ_COURSE_ID}`
        ),
      ]);
      const gData = await gRes.json();
      const pData = await pRes.json();
      const bData = await bRes.json();
      if (gData?.ok) {
        setGreen({
          front: gData.front,
          center: gData.center,
          back: gData.back,
          saved: gData.saved ?? { front: false, center: false, back: false },
        });
      }
      if (pData?.ok && Array.isArray(pData.points)) {
        setPoints(pData.points);
      } else {
        setPoints([]);
      }
      if (bData?.ok) {
        const poly = parseBoundaryGeoJson(bData.polygon);
        setBoundaryRing(
          poly ? ringFromPolygon(poly) : defaultHoleRing(activeHole)
        );
        setBoundarySaved(!!poly);
      } else {
        setBoundaryRing(defaultHoleRing(activeHole));
        setBoundarySaved(false);
      }
    } catch {
      // silencioso; reintenta al cambiar de hoyo
    }
  }, [activeHole]);

  useEffect(() => {
    refetch();
    setEditMode("off");
  }, [refetch]);

  const markers = useMemo<CalibrarMarker[]>(() => {
    const out: CalibrarMarker[] = [];
    if (green) {
      out.push({
        id: "g-front",
        lat: green.front.lat,
        lon: green.front.lon,
        label: green.saved.front ? "Entrada ✓" : "Entrada (auto)",
        color: "#34d399",
      });
      out.push({
        id: "g-center",
        lat: green.center.lat,
        lon: green.center.lon,
        label: green.saved.center ? "Centro ✓" : "Centro (auto)",
        color: "#10b981",
      });
      out.push({
        id: "g-back",
        lat: green.back.lat,
        lon: green.back.lon,
        label: green.saved.back ? "Atrás ✓" : "Atrás (auto)",
        color: "#059669",
      });
    }
    for (const p of points) {
      out.push({
        id: p.id,
        lat: p.lat,
        lon: p.lon,
        label: p.label,
        color: kindColor(p.kind),
      });
    }
    return out;
  }, [green, points]);

  const flash = (kind: "ok" | "err", text: string) => {
    setMsg({ kind, text });
    setTimeout(() => setMsg(null), 2600);
  };

  const captureGreen = async (key: "front" | "center" | "back") => {
    if (geo.status !== "ok") {
      flash("err", "Sin GPS todavía.");
      return;
    }
    setBusy(key);
    try {
      const res = await fetch("/api/captura/calibrar/green", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg: tgId,
          course_id: CCQ_COURSE_ID,
          hole: activeHole,
          key,
          lat: geo.lat,
          lon: geo.lon,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      const name =
        key === "front" ? "Entrada" : key === "center" ? "Centro" : "Atrás";
      flash("ok", `${name} del green guardada en hoyo ${activeHole}.`);
      await refetch();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(null);
    }
  };

  const capturePoint = async () => {
    if (geo.status !== "ok") {
      flash("err", "Sin GPS todavía.");
      return;
    }
    if (!newLabel.trim()) {
      flash("err", "Escribe un nombre para el punto.");
      return;
    }
    setBusy("point");
    try {
      const res = await fetch("/api/captura/calibrar/point", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg: tgId,
          course_id: CCQ_COURSE_ID,
          hole: activeHole,
          kind: newKind,
          label: newLabel.trim(),
          short_label: newShort.trim(),
          lat: geo.lat,
          lon: geo.lon,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      flash("ok", `Punto "${newLabel.trim()}" guardado.`);
      setNewLabel("");
      setNewShort("");
      setShowAdd(false);
      await refetch();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(null);
    }
  };

  const removePoint = async (id: string) => {
    setBusy(id);
    try {
      const res = await fetch(
        `/api/captura/calibrar/point?tg=${encodeURIComponent(tgId)}&id=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      flash("ok", "Punto eliminado.");
      await refetch();
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setBusy(null);
    }
  };

  const saveMarkerPosition = async (id: string, lat: number, lon: number) => {
    if (id.startsWith("g-")) {
      const key = id.replace("g-", "") as "front" | "center" | "back";
      setGreen((prev) =>
        prev
          ? {
              ...prev,
              [key]: { lat, lon },
              saved: { ...prev.saved, [key]: true },
            }
          : prev
      );
      setBusy(id);
      try {
        const res = await fetch("/api/captura/calibrar/green", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tg: tgId,
            course_id: CCQ_COURSE_ID,
            hole: activeHole,
            key,
            lat,
            lon,
          }),
        });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error || "Error");
        flash("ok", "Punto del green ajustado.");
      } catch (e) {
        flash("err", e instanceof Error ? e.message : "Error al guardar");
        await refetch();
      } finally {
        setBusy(null);
      }
      return;
    }

    setPoints((prev) =>
      prev.map((p) => (p.id === id ? { ...p, lat, lon } : p))
    );
    setBusy(id);
    try {
      const res = await fetch("/api/captura/calibrar/point", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tg: tgId, id, lat, lon }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      flash("ok", "Punto ajustado.");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar");
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const saveBoundaryVertex = async (index: number, lat: number, lon: number) => {
    const next = boundaryRing.map((v, i) =>
      i === index ? { lat, lon } : v
    );
    setBoundaryRing(next);
    setBusy("boundary");
    try {
      const polygon = polygonFromRing(activeHole, next).geometry;
      const res = await fetch("/api/captura/calibrar/boundary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tg: tgId,
          course_id: CCQ_COURSE_ID,
          hole: activeHole,
          polygon,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Error");
      setBoundarySaved(true);
      flash("ok", "Línea del hoyo ajustada.");
    } catch (e) {
      flash("err", e instanceof Error ? e.message : "Error al guardar línea");
      await refetch();
    } finally {
      setBusy(null);
    }
  };

  const changeHole = (delta: number) => {
    manualAtDetectedRef.current = insideHole;
    const base = manualHole ?? autoHole ?? nearestHole;
    let next = base + delta;
    if (next < 1) next = 18;
    if (next > 18) next = 1;
    setManualHole(next);
  };

  const accuracy = geo.status === "ok" ? Math.round(geo.accuracy) : null;
  const accuracyColor =
    accuracy == null
      ? "text-slate-400"
      : accuracy <= 8
        ? "text-emerald-400"
        : accuracy <= 15
          ? "text-amber-300"
          : "text-red-400";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-slate-100">
      {/* Mapa a pantalla completa */}
      <div className="absolute inset-0">
        {geo.status === "ok" ? (
          <CalibrarMap
            holeNo={activeHole}
            playerLat={geo.lat}
            playerLon={geo.lon}
            markers={markers}
            boundaryRing={boundaryRing}
            editMode={editMode}
            onMarkerDrag={saveMarkerPosition}
            onBoundaryVertexDrag={saveBoundaryVertex}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-slate-900 px-6 text-center text-sm text-slate-300">
            {geo.status === "denied" || geo.status === "error"
              ? `⚠ ${geo.message}`
              : "📡 Esperando GPS…"}
          </div>
        )}
      </div>

      {/* Selector de hoyo flotante (arriba izquierda) */}
      <div className="absolute left-2 top-2 z-[1000] flex items-center gap-1">
        <button
          type="button"
          onClick={() => changeHole(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/60 text-xl font-bold text-white backdrop-blur-sm"
        >
          ‹
        </button>
        <button
          type="button"
          onClick={() => setManualHole(null)}
          className="rounded-md bg-black/60 px-2.5 py-1 text-center backdrop-blur-sm"
        >
          <div className="text-sm font-black text-emerald-100">
            Hoyo {activeHole}
          </div>
          <div className="text-[8px] text-slate-300">
            {manualHole != null ? "tocar: auto" : "automático"}
          </div>
        </button>
        <button
          type="button"
          onClick={() => changeHole(1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/60 text-xl font-bold text-white backdrop-blur-sm"
        >
          ›
        </button>
      </div>

      {/* Precisión GPS + cerrar (arriba derecha) */}
      <div className="absolute right-2 top-2 z-[1000] flex items-center gap-1.5">
        <div className="rounded-md bg-black/60 px-2 py-1 text-right backdrop-blur-sm">
          <div className={`text-xs font-bold ${accuracyColor}`}>
            {accuracy == null ? "GPS…" : `±${accuracy} m`}
          </div>
          {accuracy != null && accuracy > 15 ? (
            <div className="text-[8px] text-red-300">señal débil</div>
          ) : null}
        </div>
        <Link
          href="/"
          aria-label="Cerrar"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/30 bg-black/55 text-base font-bold leading-none text-white shadow-lg backdrop-blur-sm active:scale-95"
        >
          ✕
        </Link>
      </div>

      {/* Mensaje flash */}
      {msg ? (
        <div
          className={[
            "absolute left-1/2 top-14 z-[1000] -translate-x-1/2 rounded-full px-4 py-1.5 text-xs font-bold shadow-lg",
            msg.kind === "ok"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white",
          ].join(" ")}
        >
          {msg.text}
        </div>
      ) : null}

      {/* Controles flotantes abajo */}
      <div className="absolute inset-x-0 bottom-0 z-[1000] max-h-[46vh] overflow-y-auto border-t border-slate-800/80 bg-slate-900/90 px-3 py-3 backdrop-blur-sm">
        <div className="mb-3 flex gap-1.5">
          <button
            type="button"
            onClick={() =>
              setEditMode((m) => (m === "points" ? "off" : "points"))
            }
            className={[
              "flex-1 rounded-md px-2 py-2 text-[11px] font-bold",
              editMode === "points"
                ? "bg-amber-500 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            {editMode === "points" ? "✓ Ajustar puntos" : "Ajustar puntos"}
          </button>
          <button
            type="button"
            onClick={() =>
              setEditMode((m) => (m === "boundary" ? "off" : "boundary"))
            }
            className={[
              "flex-1 rounded-md px-2 py-2 text-[11px] font-bold",
              editMode === "boundary"
                ? "bg-cyan-400 text-black"
                : "bg-slate-800 text-slate-200",
            ].join(" ")}
          >
            {editMode === "boundary"
              ? "✓ Línea hoyo"
              : `Línea hoyo${boundarySaved ? " ✓" : ""}`}
          </button>
        </div>
        <p className="mb-2 text-[10px] text-slate-400">
          {editMode === "points"
            ? "Arrastra entrada, centro, atrás o trampas sobre la foto satelital. Las yardas se recalculan con la nueva posición."
            : editMode === "boundary"
              ? "Arrastra las esquinas cyan de la línea azul hasta las orillas del campo."
              : "Marca con GPS o activa «Ajustar puntos» / «Línea hoyo» para corregir sobre la foto."}
        </p>

        <h2 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          Green del hoyo {activeHole}
        </h2>
        <div className="grid grid-cols-3 gap-1.5">
          <GreenButton
            label="Entrada"
            color="#34d399"
            saved={!!green?.saved.front}
            busy={busy === "front"}
            onClick={() => captureGreen("front")}
          />
          <GreenButton
            label="Centro"
            color="#10b981"
            saved={!!green?.saved.center}
            busy={busy === "center"}
            onClick={() => captureGreen("center")}
          />
          <GreenButton
            label="Atrás"
            color="#059669"
            saved={!!green?.saved.back}
            busy={busy === "back"}
            onClick={() => captureGreen("back")}
          />
        </div>
        <p className="mt-1.5 text-[10px] text-slate-500">
          Camina al borde del green y toca el botón estando parado ahí.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Trampas y obstáculos ({points.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowAdd((s) => !s)}
            className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white"
          >
            {showAdd ? "Cancelar" : "+ Agregar aquí"}
          </button>
        </div>

        {showAdd ? (
          <div className="mt-2 rounded-lg border border-slate-700 bg-slate-950 p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <label className="text-[11px] text-slate-300">
                Tipo
                <select
                  value={newKind}
                  onChange={(e) => setNewKind(e.target.value)}
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
                >
                  {KIND_OPTIONS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-[11px] text-slate-300">
                Etiqueta corta
                <input
                  value={newShort}
                  onChange={(e) => setNewShort(e.target.value)}
                  maxLength={6}
                  placeholder="BK"
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
              </label>
              <label className="col-span-2 text-[11px] text-slate-300">
                Nombre
                <input
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder="Ej. Bunker derecho"
                  className="mt-1 w-full rounded-md border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-white"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={busy === "point"}
              onClick={capturePoint}
              className="mt-2 w-full rounded-md bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy === "point" ? "Guardando…" : "📍 Marcar en mi posición"}
            </button>
          </div>
        ) : null}

        {points.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {points.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ background: kindColor(p.kind) }}
                  />
                  <span className="text-xs text-slate-200">{p.label}</span>
                </div>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => removePoint(p.id)}
                  className="shrink-0 rounded border border-red-700/50 px-2 py-0.5 text-[10px] text-red-300 disabled:opacity-50"
                >
                  Eliminar
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function GreenButton({
  label,
  color,
  saved,
  busy,
  onClick,
}: {
  label: string;
  color: string;
  saved: boolean;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="flex flex-col items-center rounded-lg border-2 px-1 py-2 text-center disabled:opacity-50"
      style={{ borderColor: color, background: `${color}22` }}
    >
      <span className="flex items-center gap-1 text-xs font-black text-white">
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ background: color }}
        />
        {label}
      </span>
      <span className="mt-0.5 text-[9px] font-semibold text-slate-300">
        {busy ? "guardando…" : saved ? "✓ guardado" : "marcar aquí"}
      </span>
    </button>
  );
}
