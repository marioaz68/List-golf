"use client";

/**
 * Chip GPS para marshals en /captura/marshal.
 * Muestra las iniciales del marshal y manda pings a POST /api/marshal/position.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const PING_MS = 30_000;
const MIN_DELTA_M = 8;
const HIGH_ACCURACY = true;
const MAX_AGE_MS = 10_000;
const TIMEOUT_MS = 15_000;

type ChipState = "off" | "asking" | "on" | "error";

function storageKey(profileId: string): string {
  return `lg.marshal.gps.${profileId}`;
}

function distM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

interface MarshalGpsChipProps {
  tg: string;
  profileId: string;
  tournamentId: string | null;
  initials: string;
  className?: string;
}

export default function MarshalGpsChip({
  tg,
  profileId,
  tournamentId,
  initials,
  className,
}: MarshalGpsChipProps) {
  const [state, setState] = useState<ChipState>("off");
  const [hoyo, setHoyo] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastSentPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const key = storageKey(profileId);

  const sendPing = useCallback(
    async (lat: number, lon: number, accuracy: number | null) => {
      if (!tournamentId || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/marshal/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            tg,
            tournament_id: tournamentId,
            lat,
            lon,
            accuracy,
          }),
          keepalive: true,
        });
        if (res.ok) {
          const json = (await res.json()) as { hoyo?: number | null };
          if (typeof json.hoyo === "number") setHoyo(json.hoyo);
          lastSentAtRef.current = Date.now();
          lastSentPosRef.current = { lat, lon };
        }
      } catch {
        // silencioso
      } finally {
        inFlightRef.current = false;
      }
    },
    [tg, tournamentId]
  );

  const stopWatching = useCallback(() => {
    if (watchIdRef.current != null && typeof navigator !== "undefined") {
      try {
        navigator.geolocation.clearWatch(watchIdRef.current);
      } catch {
        // ignore
      }
      watchIdRef.current = null;
    }
  }, []);

  const startWatching = useCallback(() => {
    if (!tournamentId) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      return;
    }
    setState("asking");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState("on");
        const { latitude: lat, longitude: lon, accuracy } = pos.coords;
        const now = Date.now();
        const prev = lastSentPosRef.current;
        const enoughTime = now - lastSentAtRef.current >= PING_MS;
        const enoughDelta = !prev || distM(prev, { lat, lon }) >= MIN_DELTA_M;
        if (!prev || enoughTime || enoughDelta) {
          void sendPing(lat, lon, accuracy);
        }
      },
      (err) => {
        if (err.code === 1) setState("error");
        else if (state !== "on") setState("error");
      },
      {
        enableHighAccuracy: HIGH_ACCURACY,
        maximumAge: MAX_AGE_MS,
        timeout: TIMEOUT_MS,
      }
    );
    watchIdRef.current = id;
  }, [sendPing, state, tournamentId]);

  const toggle = useCallback(() => {
    if (state === "on" || state === "asking") {
      stopWatching();
      setState("off");
      try {
        sessionStorage.setItem(key, "off");
      } catch {
        // ignore
      }
      return;
    }
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      // ignore
    }
    startWatching();
  }, [state, key, startWatching, stopWatching]);

  useEffect(() => {
    if (typeof window === "undefined" || !tournamentId) return;

    let cancelled = false;

    async function tryAutoStart() {
      let armedBySession = false;
      let offBySession = false;
      try {
        const flag = sessionStorage.getItem(key);
        armedBySession = flag === "1";
        offBySession = flag === "off";
      } catch {
        armedBySession = false;
      }

      let granted = false;
      try {
        const nav = navigator as Navigator & {
          permissions?: {
            query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
          };
        };
        if (nav.permissions?.query) {
          const status = await nav.permissions.query({
            name: "geolocation" as PermissionName,
          });
          granted = status.state === "granted";
        }
      } catch {
        granted = false;
      }

      if (cancelled) return;
      if (offBySession) return;
      if (granted || armedBySession) {
        startWatching();
      }
    }

    void tryAutoStart();
    return () => {
      cancelled = true;
      stopWatching();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const baseCls =
    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition select-none";
  const stateCls =
    state === "on"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : state === "asking"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : state === "error"
          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100";

  const disabled = !tournamentId;

  const title = disabled
    ? "Sin torneo activo para enviar GPS"
    : state === "on"
      ? `GPS activo${hoyo != null ? ` · hoyo ${hoyo}` : ""} — tócalo para apagar`
      : state === "asking"
        ? "Pidiendo permiso de ubicación..."
        : state === "error"
          ? "Permiso denegado o GPS no disponible. Toca para reintentar."
          : "GPS apagado — tócalo para compartir tu posición en el mapa";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={disabled}
      className={`${baseCls} ${stateCls} ${disabled ? "opacity-50 cursor-not-allowed" : ""} ${className ?? ""}`}
      aria-pressed={state === "on"}
      aria-label={title}
      title={title}
    >
      <span className="font-extrabold tracking-tight">{initials}</span>
      {state === "on" && hoyo != null ? (
        <span className="ml-0.5 rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800">
          H{hoyo}
        </span>
      ) : null}
    </button>
  );
}
