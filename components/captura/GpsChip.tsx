"use client";

/**
 * Chip GPS para jugador/caddie en Mini App de captura.
 *
 * - Tocar = encender / apagar.
 * - Queda “armado” ~8 h en localStorage para reabrir sola al volver a captura.
 * - Mientras la Mini App esté abierta (aunque cambies de pantalla dentro),
 *   manda pings a POST /api/captura/position para el ritmo del campo.
 *
 * Límite del navegador/iOS: con pantalla bloqueada o Mini App cerrada,
 * watchPosition se suspende. Para GPS real de 8 h en segundo plano hace
 * falta Live Location de Telegram en el chat del bot.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const PING_MS = 30_000;
const MIN_DELTA_M = 8;
const HIGH_ACCURACY = true;
const MAX_AGE_MS = 10_000;
const TIMEOUT_MS = 15_000;
/** Tiempo que recordamos “GPS armado” entre aperturas de captura. */
const ARMED_TTL_MS = 8 * 60 * 60 * 1000;

type ChipState = "off" | "asking" | "on" | "error";

function storageKey(args: {
  groupId: string | null;
  entryId: string | null;
  caddieId: string | null;
}): string {
  const a = args.caddieId
    ? `c=${args.caddieId}`
    : args.entryId
      ? `e=${args.entryId}`
      : "anon";
  return `lg.gps.${args.groupId ?? "_"}.${a}`;
}

function readArmed(key: string): { armed: boolean; off: boolean } {
  try {
    const raw = localStorage.getItem(key);
    if (raw === "off") return { armed: false, off: true };
    if (!raw) return { armed: false, off: false };
    if (raw === "1") return { armed: true, off: false };
    const until = Number(raw);
    if (Number.isFinite(until) && until > Date.now()) {
      return { armed: true, off: false };
    }
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
  return { armed: false, off: false };
}

function writeArmed(key: string, on: boolean) {
  try {
    if (on) {
      localStorage.setItem(key, String(Date.now() + ARMED_TTL_MS));
      sessionStorage.setItem(key, "1");
    } else {
      localStorage.setItem(key, "off");
      sessionStorage.setItem(key, "off");
    }
  } catch {
    // ignore
  }
}

function distM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
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
  entryId?: string | null;
  caddieId?: string | null;
  groupId?: string | null;
  /** Texto corto tipo marshal (ej. iniciales). Default "GPS". */
  label?: string;
  className?: string;
  /** Si true (default), arranca solo con permiso granted / sesión previa. */
  autoStart?: boolean;
}

export default function GpsChip({
  entryId = null,
  caddieId = null,
  groupId = null,
  label = "GPS",
  className,
  autoStart = true,
}: GpsChipProps) {
  const [state, setState] = useState<ChipState>("off");
  const [hoyo, setHoyo] = useState<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  const lastSentAtRef = useRef<number>(0);
  const lastSentPosRef = useRef<{ lat: number; lon: number } | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const wantOnRef = useRef(false);

  const key = storageKey({ groupId, entryId, caddieId });
  const canSend = Boolean(entryId || caddieId);

  const sendPing = useCallback(
    async (lat: number, lon: number, accuracy: number | null) => {
      if (!canSend || inFlightRef.current) return;
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
        // silencioso
      } finally {
        inFlightRef.current = false;
      }
    },
    [canSend, entryId, caddieId, groupId]
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
    if (!canSend) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState("error");
      return;
    }
    // Evita watches duplicados al rearmar por visibility.
    stopWatching();
    wantOnRef.current = true;
    setState("asking");
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        if (!wantOnRef.current) return;
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
        if (!wantOnRef.current) return;
        if (err.code === 1) setState("error");
        else setState("error");
      },
      {
        enableHighAccuracy: HIGH_ACCURACY,
        maximumAge: MAX_AGE_MS,
        timeout: TIMEOUT_MS,
      }
    );
    watchIdRef.current = id;
  }, [canSend, sendPing, stopWatching]);

  const toggle = useCallback(() => {
    if (state === "on" || state === "asking") {
      wantOnRef.current = false;
      stopWatching();
      setState("off");
      writeArmed(key, false);
      return;
    }
    writeArmed(key, true);
    startWatching();
  }, [state, key, startWatching, stopWatching]);

  // Auto-start + rearmar al volver a la pestaña (pantalla encendida de nuevo).
  useEffect(() => {
    if (typeof window === "undefined" || !canSend) return;

    let cancelled = false;

    async function tryAutoStart() {
      const { armed, off } = readArmed(key);
      let armedBySession = false;
      try {
        armedBySession = sessionStorage.getItem(key) === "1";
      } catch {
        armedBySession = false;
      }

      let granted = false;
      try {
        const nav = navigator as Navigator & {
          permissions?: {
            query: (d: {
              name: PermissionName;
            }) => Promise<PermissionStatus>;
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
      if (off) return;
      if (granted || armed || armedBySession || autoStart) {
        if (granted || armed || armedBySession) startWatching();
      }
    }

    void tryAutoStart();

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (!wantOnRef.current) {
        const { armed, off } = readArmed(key);
        if (off || !armed) return;
      }
      if (wantOnRef.current || readArmed(key).armed) {
        startWatching();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      stopWatching();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSend, entryId, caddieId, groupId]);

  const baseCls =
    "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition select-none shadow-sm";
  const stateCls =
    state === "on"
      ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
      : state === "asking"
        ? "border-amber-300 bg-amber-50 text-amber-700"
        : state === "error"
          ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100";

  const disabled = !canSend;
  const title = disabled
    ? "Abre la captura como jugador o caddie para activar GPS"
    : state === "on"
      ? `GPS activo para ritmo${hoyo != null ? ` · hoyo ${hoyo}` : ""}. Mantén la Mini App abierta. Para 8 h con pantalla bloqueada: Live Location 8 h en el bot de Telegram. Toca para apagar.`
      : state === "asking"
        ? "Pidiendo permiso de ubicación..."
        : state === "error"
          ? "Permiso denegado o GPS no disponible. Toca para reintentar."
          : "GPS apagado — tócalo para mandar tu posición al ritmo del campo (~8 h mientras uses captura)";

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
      <span className="font-extrabold tracking-tight">{label}</span>
      {state === "on" ? (
        <>
          <span className="text-[10px] font-bold text-emerald-800">ON</span>
          {hoyo != null ? (
            <span className="ml-0.5 rounded bg-emerald-100 px-1 text-[10px] font-bold text-emerald-800">
              H{hoyo}
            </span>
          ) : null}
        </>
      ) : state === "off" ? (
        <span className="text-[10px] font-bold opacity-80">OFF</span>
      ) : state === "asking" ? (
        <span className="text-[10px] font-bold">…</span>
      ) : (
        <span className="text-[10px] font-bold">!</span>
      )}
    </button>
  );
}
