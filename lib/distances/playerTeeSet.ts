import {
  normalizeTeeSetCode,
  type TeeSetCode,
} from "@/lib/distances/teePositions";

const STORAGE_PREFIX = "listgolf-playing-tee-v1";

function storageKey(scope?: string): string {
  const s = scope?.trim();
  return s ? `${STORAGE_PREFIX}:${s}` : STORAGE_PREFIX;
}

export function loadPlayingTeeCode(scope?: string): TeeSetCode {
  if (typeof window === "undefined") return "BLK";
  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    if (!raw) return "BLK";
    return normalizeTeeSetCode(raw);
  } catch {
    return "BLK";
  }
}

export function savePlayingTeeCode(code: TeeSetCode, scope?: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(scope), normalizeTeeSetCode(code));
  } catch {
    /* ignore quota */
  }
}
