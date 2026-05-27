"use client";

import { usePathname, useSearchParams } from "next/navigation";

type Props = {
  playerId: string;
  hasFile: boolean;
  compact?: boolean;
};

/**
 * Enlace al visor del reporte GHIN. El visor incluye barra superior +
 * inferior con botón de cerrar para volver al flujo de votación.
 */
export default function OpenHandicapFileButton({
  playerId,
  hasFile,
  compact = false,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!hasFile) return null;

  const search = searchParams?.toString();
  const currentUrl = search ? `${pathname}?${search}` : pathname;
  const href = `/handicap-report/${encodeURIComponent(playerId)}?return=${encodeURIComponent(currentUrl)}`;

  return (
    <div className={compact ? "shrink-0" : "w-full"}>
      <a
        href={href}
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
