"use client";

import { usePathname, useSearchParams } from "next/navigation";

type Props = {
  playerId: string;
  /** Inscripción del jugador en el torneo actual; ancla el regreso a la carta. */
  entryId?: string | null;
  /**
   * Compuerta de rol: mismo criterio que RLS (`fn_user_can_read_ghin`).
   * Si es false, no se renderiza el botón.
   */
  canReadGhin: boolean;
  compact?: boolean;
  label?: string;
};

/**
 * Enlace al reporte GHIN calculado en vivo (/handicap-report/[playerId]).
 * Solo visible si el usuario puede leer tablas GHIN (comité / dirección).
 */
export default function OpenHandicapFileButton({
  playerId,
  entryId,
  canReadGhin,
  compact = false,
  label = "📄 Ver reporte GHIN",
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (!canReadGhin) return null;

  const search = searchParams?.toString();
  const hash = entryId ? `#entry-${entryId}` : "";
  const currentUrl = `${pathname}${search ? `?${search}` : ""}${hash}`;

  const tournamentId = searchParams?.get("tournament_id")?.trim() || "";
  const qs = new URLSearchParams();
  qs.set("return", currentUrl);
  if (tournamentId) qs.set("tournament_id", tournamentId);

  const href = `/handicap-report/${encodeURIComponent(playerId)}?${qs.toString()}`;

  return (
    <div className={compact ? "shrink-0" : "w-full"}>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
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
