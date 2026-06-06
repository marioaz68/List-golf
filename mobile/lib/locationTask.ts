/**
 * Definición del task de background que corre incluso con la pantalla
 * bloqueada. Esta es la pieza que diferencia la app nativa de la PWA:
 * Android le da a un foreground service permiso de mandar GPS sin que el
 * usuario tenga la app al frente.
 *
 * IMPORTANTE: este archivo se importa UNA sola vez desde el root layout
 * para que `TaskManager.defineTask` se registre antes de que cualquier
 * pantalla intente iniciar el tracking. Si lo defines dentro de un
 * componente, expo-task-manager no lo encuentra al despertarse.
 */

import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LOCATION_TASK_NAME, MIN_DISTANCE_M, PING_INTERVAL_MS } from "./config";
import { sendPosition } from "./api";

const LAST_PING_KEY = "listgolf.background.lastPing";

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

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error("LOCATION TASK error:", error);
    return;
  }
  if (!data) return;

  const { locations } = data as { locations: Location.LocationObject[] };
  if (!locations || locations.length === 0) return;

  const latest = locations[locations.length - 1];
  if (!latest?.coords) return;

  const { latitude: lat, longitude: lon, accuracy } = latest.coords;

  // Throttling: el OS puede dispararnos varias veces seguidas. Solo
  // enviamos al backend cuando pasó PING_INTERVAL_MS o cuando el usuario
  // se movió más de MIN_DISTANCE_M.
  let lastPing: LastPing | null = null;
  try {
    const raw = await AsyncStorage.getItem(LAST_PING_KEY);
    if (raw) lastPing = JSON.parse(raw) as LastPing;
  } catch {
    lastPing = null;
  }

  const now = Date.now();
  if (lastPing) {
    const enoughTime = now - lastPing.ts >= PING_INTERVAL_MS;
    const enoughMove = distM(lastPing, { lat, lon }) >= MIN_DISTANCE_M;
    if (!enoughTime && !enoughMove) return;
  }

  // Necesitamos saber con qué credenciales mandar. Los guardamos en
  // AsyncStorage también para que estén disponibles al background task.
  const [caddieId, entryId] = await Promise.all([
    AsyncStorage.getItem("listgolf.session.caddieId.public"),
    AsyncStorage.getItem("listgolf.session.entryId.public"),
  ]);
  if (!caddieId && !entryId) return;

  await sendPosition({
    caddieId,
    entryId,
    lat,
    lon,
    accuracy: typeof accuracy === "number" ? accuracy : null,
  });

  try {
    await AsyncStorage.setItem(
      LAST_PING_KEY,
      JSON.stringify({ ts: now, lat, lon } satisfies LastPing)
    );
  } catch {
    /* no bloquea */
  }
});

/** Espejo "público" del session en AsyncStorage (TaskManager no puede leer
 *  SecureStore en background reliablemente). Se actualiza cuando el usuario
 *  inicia/cierra sesión. */
export async function syncSessionToBackgroundStorage(args: {
  caddieId: string | null;
  entryId: string | null;
}): Promise<void> {
  await Promise.all([
    args.caddieId
      ? AsyncStorage.setItem("listgolf.session.caddieId.public", args.caddieId)
      : AsyncStorage.removeItem("listgolf.session.caddieId.public"),
    args.entryId
      ? AsyncStorage.setItem("listgolf.session.entryId.public", args.entryId)
      : AsyncStorage.removeItem("listgolf.session.entryId.public"),
  ]);
}

export async function startBackgroundTracking(): Promise<{
  ok: boolean;
  error?: string;
}> {
  try {
    // Permisos: necesitamos "Always" en iOS y "ACCESS_BACKGROUND_LOCATION"
    // en Android para correr en background. iOS pide primero foreground.
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      return { ok: false, error: "Permiso de ubicación en foreground denegado" };
    }
    const bg = await Location.requestBackgroundPermissionsAsync();
    if (bg.status !== "granted") {
      return {
        ok: false,
        error:
          "Permiso de ubicación en segundo plano denegado. La app no podrá tracking con pantalla bloqueada.",
      };
    }

    const isRunning = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME
    );
    if (isRunning) return { ok: true };

    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation,
      timeInterval: PING_INTERVAL_MS,
      distanceInterval: MIN_DISTANCE_M,
      showsBackgroundLocationIndicator: true,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: "List.Golf · ritmo del campo",
        notificationBody:
          "Compartiendo tu posición con el comité durante la ronda.",
        notificationColor: "#0f172a",
      },
    });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "Error desconocido" };
  }
}

export async function stopBackgroundTracking(): Promise<void> {
  try {
    const isRunning = await Location.hasStartedLocationUpdatesAsync(
      LOCATION_TASK_NAME
    );
    if (isRunning) {
      await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    }
  } catch {
    /* no bloquea */
  }
}

export async function isBackgroundTrackingActive(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
  } catch {
    return false;
  }
}
