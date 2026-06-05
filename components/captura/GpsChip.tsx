"use client";

/**
 * Chip GPS mínimo para la Mini App de captura.
 *
 * Estados visuales:
 *   - off (rojo)      → el caddie/jugador no ha activado el GPS
 *   - asking (ámbar)  → navegador pidiendo permiso de ubicación
 *   - on (verde)      → watchPosition activo, mandando pings
 *   - error (rojo)    → permiso denegado o GPS no disponible
 *
 * Comportamiento:
 *  - Al tocar OFF → llama navigator.geolocation.watchPosition.
 *  - Mientras está ON → manda POST /api/captura/position cada PING_MS o
 *    cuando watchPosition reporte una posición nueva (lo que pase primero).
 *  - Recordamos el estado en sessionStorage (clave por group_id+actor) para
 *    que sobreviva a recargas de la pestaña dentro de la misma sesión.
 *  - Sin layout extra: cabe en cualquier flex/grid del header existente.
 *
 * Nota: el navegador solo manda GPS mientras la pestaña esté visible y
 * cargada. Cuando el caddie bloquea pantalla, el iOS suspende
 * watchPosition. Para 8 h continuas con pantalla bloqueada, Live Location
 * de Telegram sigue siendo el camino. Este chip es el flujo cómodo para
 * cuando el celular está abierto durante la ronda.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const PING_MS = 30_000;       // cada 30 s mínimo
const MIN_DELTA_M = 8;        // ignora movimientos < 8 m
const HIGH_ACCURACY = true;
const MAX_AGE_MS = 10_000;
const TIMEOUT_MS = 15_000;

type ChipState = "off" | "asking" | "on" | "error";

function storageKey(args: { groupId: string | null; entryId: string | null; caddieId: string | null }): string {
  const a = args.caddieId ? `c=${args.caddieId}` : args.entryId ? `e=${args.entryId}` : "anon";
  return `lg.gps.${args.groupId ?? "_"}.${a}`;
}

/** Distancia aprox en metros entre 2 puntos (suficiente para deduplicar). */
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

interface GpsChipProps {
  /** UUID del entry (jugador) en este grupo — si el caddie abrió, va null. */
  entryId?: string | null;
  /** UUID del caddie — si el jugador abrió, va null. */
  caddieId?: string | null;
  /** UUID del grupo (siempre disponible en la URL de la Mini App). */
  groupId: string | null;
  className?: string;
}

export default function GpsChip({
  entryId = null,
  caddieId = null,
  groupId,
  className,
}: GpsChipProps) {
  const [state, setState] = useState<ChipState>("off");
  const [hoyo, setHoyo] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastSentPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const inFlightRef = useRef<boolean>(false);

  const key = storageKey({ groupId, entryId, caddieId });

  const sendPing = useCallback(
    async (lat: number, lon: number, accuracy: number | null) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const res = await fetch("/api/captura/position", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            entry_id: entryId,
            caddie_id: caddieId,
            group_id: groupId,
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
        // silencioso: el siguiente watchPosition reintenta
      } finally {
        inFlightRef.current = false;
      }
    },
    [entryId, caddieId, groupId]
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
        const enoughDelta =
          !prev || distM(prev, { lat, lon }) >= MIN_DELTA_M;
        // Mandar siempre el primer ping; luego solo si pasó PING_MS o se movió MIN_DELTA_M.
        if (!prev || enoughTime || enoughDelta) {
          void sendPing(lat, lon, accuracy);
        }
      },
      (err) => {
        // 1 = permission denied, 2 = position unavailable, 3 = timeout
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
  }, [sendPing, state]);

  const toggle = useCallback(() => {
    if (state === "on" || state === "asking") {
      stopWatching();
      setState("off");
      try {
        sessionStorage.removeItem(key);
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

  // Auto-start al montar el componente:
  //
  // 1. Si el navegador ya tiene permiso "granted" para este dominio
  //    (porque el usuario lo concedió en una visita anterior), arrancamos
  //    watchPosition inmediato — el caddie no tiene que tocar el chip.
  // 2. Como respaldo (Safari iOS antiguo no soporta permissions.query),
  //    también checamos sessionStorage por si el usuario lo activó en
  //    esta misma sesión y la pestaña recargó.
  // 3. Si el permiso está "prompt" o "denied", quedamos en off — el
  //    usuario tiene que tocar el chip para disparar el prompt (regla
  //    de seguridad de Chrome/Safari: la primera vez requiere gesto).
  useEffect(() => {
    if (typeof window === "undefined") return;

    let cancelled = false;

    async function tryAutoStart() {
      // Respaldo: sessionStorage (misma sesión, post-reload)
      let armedBySession = false;
      try {
        armedBySession = sessionStorage.getItem(key) === "1";
      } catch {
        armedBySession = false;
      }

      // Vía moderna: Permissions API. granted = navegador ya autorizó
      // este dominio. prompt = no ha decidido. denied = bloqueado.
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

      if (granted || armedBySession) {
        startWatching();
      }
    }

    void tryAutoStart();
    return () => {
      cancelled = true;
      stopWatching();
    };
    // intentional: solo en mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const baseCls =
    "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold transition select-none";
  const stateCls =
    state === "on"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : state === "asking"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : "border-red-300 bg-red-50 text-red-700 hover:bg-red-100";

  // Icono inline SVG (sin dependencias externas).
  const iconSatellite = (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3 w-3"
    >
      <path d="M3.5 13.5A8 8 0 0 1 10.5 20.5" />
      <path d="M3.5 9A12 12 0 0 1 15 20.5" />
      <circle cx="6" cy="18" r="2" />
      <path d="M14.5 4.5l5 5-3 3-5-5z" />
      <path d="M11.5 7.5l5 5" />
    </svg>
  );

  const title =
    state === "on"
      ? `GPS activo${hoyo != null ? ` · hoyo ${hoyo}` : ""} — tócalo para apagar`
      : state === "asking"
        ? "Pidiendo permiso de ubicación..."
        : state === "error"
          ? "Permiso denegado o GPS no disponible. Toca para reintentar."
          : "GPS apagado — tócalo para enviar posición al ritmo del campo";

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${baseCls} ${stateCls} ${className ?? ""}`}
      aria-pressed={state === "on"}
      aria-label={title}
      title={title}
    >
      {iconSatellite}
      <span>GPS</span>
      {state === "on" && hoyo != null ? (
        <span className="ml-1 rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800">
          H{hoyo}
        </span>
      ) : null}
    </button>
  );
}
