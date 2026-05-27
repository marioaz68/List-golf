"use client";

import { usePathname, useSearchParams } from "next/navigation";

type Props = {
  playerId: string;
  /** Inscripción del jugador en el torneo actual; se usa como ancla para
   * que el regreso del visor del reporte abra la misma carta. */
  entryId?: string | null;
  hasFile: boolean;
  compact?: boolean;
  label?: string;
};

/**
 * Enlace al visor del reporte GHIN. El visor incluye barra superior +
 * inferior con botón de cerrar para volver al flujo de votación.
 */
export default function OpenHandicapFileButton({
  playerId,
  entryId,
  hasFile,
  compact = false,
  label = "📄 Ver reporte GHIN",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!hasFile) return null;

  const search = searchParams?.toString();
  const hash = entryId ? `#entry-${entryId}` : "";
  const currentUrl = `${pathname}${search ? `?${search}` : ""}${hash}`;
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
        {label}
      </a>
    </div>
  );
}
