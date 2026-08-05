import { randomBytes } from "crypto";

export const PLAYER_ACCEPT_TOKEN_TTL_HOURS = 48;

export function mintPlayerAcceptToken(): string {
  return randomBytes(24).toString("hex"); // 48 hex chars
}

export function playerAcceptTokenExpiresAt(
  from: Date = new Date(),
  hours: number = PLAYER_ACCEPT_TOKEN_TTL_HOURS
): string {
  const d = new Date(from.getTime());
  d.setHours(d.getHours() + hours);
  return d.toISOString();
}

/** Base URL pública del sitio (link del jugador). */
export function publicAppBaseUrl(): string {
  const explicit = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  )
    .trim()
    .replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  }
  return "https://www.listgolf.club";
}

export function playerAcceptUrl(token: string): string {
  return `${publicAppBaseUrl()}/aceptar-cerca/${encodeURIComponent(token)}`;
}
