"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Botón "← Volver" para las vistas de captura.
 *
 * Lógica del click:
 *  1. Si hay un `?back=/ruta` en la URL, navegamos ahí directamente
 *     (es lo más predecible: lo configura quien generó el link).
 *  2. Si la pestaña fue abierta con `window.open` (existe `window.opener`)
 *     y no hay `?back=`, intentamos cerrarla — la pestaña original ya
 *     tiene el menú abierto.
 *  3. Como último recurso, `fallbackHref` (default `/score-entry`).
 *
 * No usamos `router.back()` porque en Telegram / móvil el historial suele
 * llevar a login u otra ruta impredecible; el destino explícito es más fiable.
 */
export default function BackButton({
  fallbackHref = "/score-entry",
  className,
  label = "← Volver",
}: {
  fallbackHref?: string;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const backParam = searchParams.get("back")?.trim() || null;
  const [openedAsTab, setOpenedAsTab] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenedAsTab(Boolean(window.opener));
  }, []);

  const cls =
    className ??
    "inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50";

  // Cuando viene de un link explícito con back=, ese gana siempre.
  // Solo mostramos "✕ Volver al menú" cuando intentaremos cerrar la pestaña.
  const willCloseTab = openedAsTab && !backParam;
  const buttonLabel = willCloseTab ? "✕ Volver al menú" : label;

  const handleClick = () => {
    if (backParam) {
      router.push(backParam);
      return;
    }
    if (openedAsTab) {
      try {
        window.close();
        return;
      } catch {
        // si el navegador rechaza cerrar la pestaña, navegamos
      }
    }
    router.push(fallbackHref);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cls}
      aria-label={
        willCloseTab
          ? "Cerrar pestaña y volver al menú anterior"
          : "Volver al menú anterior"
      }
      title={
        willCloseTab
          ? "Cerrar esta pestaña y volver al menú donde elegiste al jugador"
          : "Volver al menú donde elegiste al jugador"
      }
    >
      {buttonLabel}
    </button>
  );
}
