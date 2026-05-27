"use client";

import { useSyncExternalStore } from "react";
import { handicapReportApiPath } from "@/lib/player-files/handicapReportApiPath";

type Props = {
  playerId: string;
  hasFile: boolean;
  compact?: boolean;
};

function subscribeViewport(cb: () => void) {
  const mq = window.matchMedia("(max-width: 767px), (pointer: coarse)");
  const onChange = () => cb();
  mq.addEventListener("change", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    mq.removeEventListener("change", onChange);
    window.removeEventListener("resize", onChange);
  };
}

function getIsMobileViewport() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(max-width: 767px), (pointer: coarse)").matches
  );
}

/**
 * Enlace directo al reporte GHIN (no server action + window.open).
 * En móvil Safari bloquea popups abiertos después de async; un <a href>
 * con redirect en /api/... funciona al primer toque. En móvil abrimos en la
 * misma pestaña; en escritorio, nueva pestaña.
 */
export default function OpenHandicapFileButton({
  playerId,
  hasFile,
  compact = false,
}: Props) {
  const isMobile = useSyncExternalStore(
    subscribeViewport,
    getIsMobileViewport,
    () => false
  );

  if (!hasFile) return null;

  const href = handicapReportApiPath(playerId);

  return (
    <div className={compact ? "shrink-0" : "w-full"}>
      <a
        href={href}
        {...(isMobile
          ? {}
          : { target: "_blank", rel: "noopener noreferrer" })}
        onClick={(e) => {
          e.stopPropagation();
        }}
        className={
          compact
            ? "inline-flex h-8 shrink-0 items-center justify-center rounded border border-indigo-700 bg-indigo-600 px-2 text-[10px] font-bold text-white no-underline hover:bg-indigo-700 active:bg-indigo-800"
            : "flex w-full items-center justify-center rounded-lg border border-indigo-700 bg-indigo-600 px-3 py-2 text-sm font-semibold text-white no-underline hover:bg-indigo-700 active:bg-indigo-800"
        }
      >
        📄 Ver reporte GHIN
      </a>
    </div>
  );
}
