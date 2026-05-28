"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Intervalo en milisegundos. Por defecto 10000 (10 s). */
  intervalMs?: number;
};

/**
 * Refresca el server component padre llamando `router.refresh()` cada
 * `intervalMs` para que las páginas públicas (leaderboard, matches en
 * vivo, cuadro, etc.) reflejen capturas recientes sin que el usuario
 * tenga que recargar manualmente.
 *
 * - Se pausa cuando la pestaña está oculta (`document.hidden`) para
 *   no quemar Server Actions / requests en background.
 * - Hace un refresh inmediato al volver a la pestaña.
 * - No bloquea ni cambia la URL.
 */
export default function AutoRefresh({ intervalMs = 10000 }: Props) {
  const router = useRouter();
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const safeInterval = Math.max(2000, intervalMs);

    function tick() {
      if (typeof document !== "undefined" && document.hidden) return;
      router.refresh();
    }

    function start() {
      stop();
      timerRef.current = setInterval(tick, safeInterval);
    }

    function stop() {
      if (timerRef.current != null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    function onVisibility() {
      if (document.hidden) {
        stop();
      } else {
        router.refresh();
        start();
      }
    }

    start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, router]);

  return null;
}
