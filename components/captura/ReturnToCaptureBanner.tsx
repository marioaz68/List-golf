"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";

/**
 * Solo permite volver a rutas de captura pública (evita open-redirect).
 */
export function sanitizeCapturaReturnPath(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // Aceptar ruta relativa tipo /captura/mobile?...
  if (!s.startsWith("/captura/")) return null;
  if (s.startsWith("//")) return null;
  if (/[\s<>"']/.test(s)) return null;
  return s;
}

/** Query param en páginas públicas → path de regreso a captura. */
export const CAPTURA_RETURN_PARAM = "return_captura";

/**
 * Añade el retorno a captura en un href de resultados en vivo.
 */
export function withCapturaReturn(
  liveHref: string,
  capturePath: string | null | undefined
): string {
  const safe = sanitizeCapturaReturnPath(capturePath);
  if (!safe) return liveHref;
  try {
    // liveHref puede ser relativo (/torneos/...)
    const u = new URL(liveHref, "https://local.invalid");
    u.searchParams.set(CAPTURA_RETURN_PARAM, safe);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    const join = liveHref.includes("?") ? "&" : "?";
    return `${liveHref}${join}${CAPTURA_RETURN_PARAM}=${encodeURIComponent(safe)}`;
  }
}

/**
 * Construye la URL de la mini-app de captura (por hoyo) con identidad Telegram.
 */
export function buildCapturaMobileReturnPath(params: {
  groupId: string;
  me?: string | null;
  caddie?: string | null;
}): string | null {
  const gid = String(params.groupId ?? "").trim();
  if (!gid) return null;
  const sp = new URLSearchParams({ group_id: gid });
  const me = String(params.me ?? "").trim();
  const caddie = String(params.caddie ?? "").trim();
  if (me) sp.set("me", me);
  if (caddie) sp.set("caddie", caddie);
  return `/captura/mobile?${sp.toString()}`;
}

function ReturnToCaptureBannerInner({
  className = "",
}: {
  className?: string;
}) {
  const searchParams = useSearchParams();
  const href = useMemo(
    () =>
      sanitizeCapturaReturnPath(
        searchParams.get(CAPTURA_RETURN_PARAM) ??
          searchParams.get("return_captura")
      ),
    [searchParams]
  );

  if (!href) return null;

  return (
    <div
      className={[
        "sticky top-0 z-[60] border-b border-emerald-700/50 bg-emerald-950/95 px-3 py-2 shadow-md backdrop-blur-sm",
        className,
      ].join(" ")}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
        <Link
          href={href}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border border-emerald-400 bg-emerald-500 px-4 py-2 text-sm font-bold text-emerald-950 shadow-sm hover:bg-emerald-400"
        >
          ← Volver a captura
        </Link>
      </div>
    </div>
  );
}

/**
 * Banner sticky: “Volver a captura” cuando se llegó desde la mini-app Telegram.
 * Lee `?return_captura=/captura/mobile?group_id=…`.
 */
export default function ReturnToCaptureBanner(props: {
  className?: string;
}) {
  return (
    <Suspense fallback={null}>
      <ReturnToCaptureBannerInner {...props} />
    </Suspense>
  );
}
