export type Locale = "es" | "en";

export const LOCALE_COOKIE = "listgolf_locale";

export function parseLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "es";
}
