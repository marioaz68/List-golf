/**
 * Puente JS: eventos del Apple Watch (vía módulo nativo) → API List.Golf.
 *
 * El iPhone debe estar logueado (caddie_id / entry_id en SecureStore).
 * El Watch manda GPS y swings por WatchConnectivity; este módulo los reenvía.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import {
  activateWatchSync,
  addWatchEventListener,
  isWatchSyncAvailable,
  pushAuthToWatch,
  type WatchOutboundEvent,
} from "listgolf-watch-sync";
import { sendPosition, sendWatchSwing } from "./api";
import { loadSession } from "./auth";
import { MIN_DISTANCE_M, PING_INTERVAL_MS } from "./config";

const LAST_WATCH_PING_KEY = "listgolf.watch.lastPing";

interface LastPing {
  ts: number;
  lat: number;
  lon: number;
}

function distM(a: LastPing, b: { lat: number; lon: number }): number {
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

async function shouldSendPosition(lat: number, lon: number): Promise<boolean> {
  let lastPing: LastPing | null = null;
  try {
    const raw = await AsyncStorage.getItem(LAST_WATCH_PING_KEY);
    if (raw) lastPing = JSON.parse(raw) as LastPing;
  } catch {
    lastPing = null;
  }

  const now = Date.now();
  if (!lastPing) return true;

  const enoughTime = now - lastPing.ts >= PING_INTERVAL_MS;
  const enoughMove = distM(lastPing, { lat, lon }) >= MIN_DISTANCE_M;
  return enoughTime || enoughMove;
}

async function markPositionSent(lat: number, lon: number): Promise<void> {
  try {
    await AsyncStorage.setItem(
      LAST_WATCH_PING_KEY,
      JSON.stringify({ ts: Date.now(), lat, lon } satisfies LastPing)
    );
  } catch {
    /* no bloquea */
  }
}

async function handleWatchEvent(event: WatchOutboundEvent): Promise<void> {
  const session = await loadSession();
  if (!session.caddieId && !session.entryId) return;

  if (event.type === "position") {
    const ok = await shouldSendPosition(event.lat, event.lon);
    if (!ok) return;

    const res = await sendPosition({
      caddieId: session.caddieId,
      entryId: session.entryId,
      lat: event.lat,
      lon: event.lon,
      accuracy: event.accuracy ?? null,
    });
    if (res.ok) {
      await markPositionSent(event.lat, event.lon);
    }
    return;
  }

  if (event.type === "swing") {
    await sendWatchSwing({
      caddieId: session.caddieId,
      entryId: session.entryId,
      lat: event.lat,
      lon: event.lon,
      swingNo: event.swingNo,
      detectedAt: new Date(event.ts * 1000).toISOString(),
      backswingVelocityDps: event.backswing_velocity_dps,
      forwardSwingVelocityDps: event.forwardswing_velocity_dps,
      backswingClubDeg: event.backswing_club_deg,
      forwardClubDeg: event.forward_club_deg,
    });
  }
}

let started = false;
let removeListener: (() => void) | null = null;

/** Activa WatchConnectivity y escucha eventos del reloj. Idempotente. */
export function startWatchSyncBridge(): void {
  if (started || Platform.OS !== "ios" || !isWatchSyncAvailable()) return;
  started = true;
  activateWatchSync();
  const sub = addWatchEventListener((event) => {
    void handleWatchEvent(event);
  });
  removeListener = sub.remove;
}

export function stopWatchSyncBridge(): void {
  removeListener?.();
  removeListener = null;
  started = false;
}

/** Empuja sesión al Watch (application context). Llamar tras login. */
export async function syncAuthToWatch(): Promise<void> {
  if (Platform.OS !== "ios" || !isWatchSyncAvailable()) return;
  const session = await loadSession();
  activateWatchSync();
  pushAuthToWatch(session.displayName);
}
