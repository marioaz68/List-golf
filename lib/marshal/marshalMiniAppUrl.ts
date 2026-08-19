const PRODUCTION_FALLBACK = "https://www.listgolf.club";

function normalizeBase(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (!trimmed) return null;
  if (
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$/i.test(trimmed)
  ) {
    return null;
  }
  return trimmed;
}

function appBaseUrl(): string {
  const explicit = normalizeBase(process.env.NEXT_PUBLIC_APP_URL);
  if (explicit) return explicit;
  const prodDomain = normalizeBase(
    process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : null
  );
  if (prodDomain) return prodDomain;
  const vercelUrl = normalizeBase(
    process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null
  );
  if (vercelUrl) return vercelUrl;
  return PRODUCTION_FALLBACK;
}

/** URL de la mini app marshal (capturas retrasadas + resultados en vivo). */
export function buildMarshalMiniAppUrl(params: {
  telegramChatId: string;
  tournamentId?: string | null;
  base?: string;
}): string {
  const base = normalizeBase(params.base) ?? appBaseUrl();
  const tg = String(params.telegramChatId ?? "").trim();
  const url = new URL("/captura/marshal", base);
  if (tg) url.searchParams.set("tg", tg);
  const tid = String(params.tournamentId ?? "").trim();
  if (tid) url.searchParams.set("tournament_id", tid);
  return url.toString();
}
