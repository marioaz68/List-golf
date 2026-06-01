"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Botón "← Volver" para las vistas de captura.
 *
 * Lógica del click:
 *  1. Si la pestaña fue abierta con `window.open` (existe `window.opener`)
 *     intentamos cerrarla — la pestaña original ya tiene el menú abierto
 *     y el usuario regresa ahí naturalmente.
 *  2. Si hay un `?back=/ruta` en la URL, la usamos como destino.
 *  3. Si hay historial dentro de la app, hacemos `router.back()`.
 *  4. Como último recurso, `fallbackHref` (default `/`).
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
  const searchParams = useSearchParams();
  const backParam = searchParams.get("back");
  const [canGoBack, setCanGoBack] = useState(false);
  const [openedAsTab, setOpenedAsTab] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCanGoBack(window.history.length > 1);
    setOpenedAsTab(Boolean(window.opener));
  }, []);

  const cls =
    className ??
    "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50";

  const target = backParam?.trim() || fallbackHref;
  const buttonLabel = openedAsTab ? "✕ Volver al menú" : label;

  const handleClick = () => {
    if (openedAsTab) {
      try {
        window.close();
        return;
      } catch {
        // si el navegador rechaza cerrar la pestaña, navegamos
      }
    }
    if (canGoBack && !backParam) {
      router.back();
      return;
    }
    router.push(target);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cls}
      aria-label={
        openedAsTab
          ? "Cerrar pestaña y volver al menú anterior"
          : "Volver al menú anterior"
      }
      title={
        openedAsTab
          ? "Cerrar esta pestaña y volver al menú donde elegiste al jugador"
          : "Volver al menú donde elegiste al jugador"
      }
    >
      {buttonLabel}
    </button>
  );
}
