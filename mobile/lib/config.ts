/**
 * Configuración base de la app móvil.
 *
 * `API_BASE_URL` apunta al backend de List.Golf (mismo Vercel + Supabase que
 * el sistema web). Se puede sobreescribir con la variable de entorno
 * EXPO_PUBLIC_API_BASE_URL al hacer build (eas.json o terminal).
 */

const FALLBACK_API_BASE_URL = "https://www.listgolf.club";

export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() || FALLBACK_API_BASE_URL;

/** Intervalo mínimo entre pings GPS al backend (ms). */
export const PING_INTERVAL_MS = 30_000;

/** Distancia mínima en metros para enviar un nuevo ping aunque no haya pasado
 *  el intervalo (movimientos relevantes). */
export const MIN_DISTANCE_M = 8;

/** Identificador del task de background. Cualquier referencia a esta
 *  constante debe coincidir entre `registerBackgroundLocation` y
 *  `TaskManager.defineTask`. */
export const LOCATION_TASK_NAME = "listgolf-location-background";
