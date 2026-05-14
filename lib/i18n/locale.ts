export type Locale = "es" | "en";

export const LOCALE_COOKIE = "listgolf_locale";

export function parseLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "es";
}

/** Lee el idioma guardado en la cookie (solo en el navegador). Útil para UI cliente alineada con ES/EN. */
export function readLocaleFromDocumentCookie(): Locale {
  if (typeof document === "undefined") return "es";
  const prefix = `${LOCALE_COOKIE}=`;
  const pair = document.cookie.split("; ").find((row) => row.startsWith(prefix));
  if (!pair) return "es";
  const raw = pair.slice(prefix.length);
  try {
    return parseLocale(decodeURIComponent(raw));
  } catch {
    return parseLocale(raw);
  }
}
