"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Botón "← Volver" para las vistas de captura.
 *
 * - Si hay historial dentro de la app, hace `router.back()`.
 * - Si la pestaña abrió esta URL directamente (p. ej. link de Telegram o
 *   tarjeta del comité), usa `fallbackHref` para no dejar al usuario sin
 *   salida.
 */
export default function BackButton({
  fallbackHref = "/",
  className,
  label = "← Volver",
}: {
  fallbackHref?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCanGoBack(window.history.length > 1);
  }, []);

  const cls =
    className ??
    "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50";

  if (canGoBack) {
    return (
      <button
        type="button"
        onClick={() => router.back()}
        className={cls}
      >
        {label}
      </button>
    );
  }

  return (
    <Link href={fallbackHref} className={cls}>
      {label}
    </Link>
  );
}
