/**
 * Almacenamiento de la sesión del caddie/jugador en la app.
 *
 * El usuario se autentica una sola vez con un código que obtiene del bot
 * @ListGolfBot (comando `/codigo`). El backend valida ese código y devuelve
 * el caddie_id o entry_id real. Guardamos esos UUIDs en SecureStore para
 * que la app los reuse en cada ping de GPS sin volver a autenticar.
 */

import * as SecureStore from "expo-secure-store";

const KEY_CADDIE_ID = "listgolf.session.caddieId";
const KEY_ENTRY_ID = "listgolf.session.entryId";
const KEY_DISPLAY_NAME = "listgolf.session.displayName";

export interface MobileSession {
  caddieId: string | null;
  entryId: string | null;
  displayName: string | null;
}

export async function loadSession(): Promise<MobileSession> {
  const [caddieId, entryId, displayName] = await Promise.all([
    SecureStore.getItemAsync(KEY_CADDIE_ID),
    SecureStore.getItemAsync(KEY_ENTRY_ID),
    SecureStore.getItemAsync(KEY_DISPLAY_NAME),
  ]);
  return {
    caddieId: caddieId ?? null,
    entryId: entryId ?? null,
    displayName: displayName ?? null,
  };
}

export async function saveSession(session: MobileSession): Promise<void> {
  await Promise.all([
    session.caddieId
      ? SecureStore.setItemAsync(KEY_CADDIE_ID, session.caddieId)
      : SecureStore.deleteItemAsync(KEY_CADDIE_ID),
    session.entryId
      ? SecureStore.setItemAsync(KEY_ENTRY_ID, session.entryId)
      : SecureStore.deleteItemAsync(KEY_ENTRY_ID),
    session.displayName
      ? SecureStore.setItemAsync(KEY_DISPLAY_NAME, session.displayName)
      : SecureStore.deleteItemAsync(KEY_DISPLAY_NAME),
  ]);
}

export async function clearSession(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(KEY_CADDIE_ID),
    SecureStore.deleteItemAsync(KEY_ENTRY_ID),
    SecureStore.deleteItemAsync(KEY_DISPLAY_NAME),
  ]);
}

export function isAuthenticated(session: MobileSession): boolean {
  return Boolean(session.caddieId || session.entryId);
}
