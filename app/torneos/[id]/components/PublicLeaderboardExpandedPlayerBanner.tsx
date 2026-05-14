import type { PublicDetailTableLabels } from "../lib/publicDetailTableLabels";
import type { LeaderboardRow } from "../lib/types";

/**
 * Al expandir el detalle hoyo por hoyo, la fila principal suele mostrar nombre abreviado
 * (primer apellido oculto si no hay homónimos). Este bloque muestra identidad completa.
 */
export default function PublicLeaderboardExpandedPlayerBanner({
  row,
  labels,
}: {
  row: LeaderboardRow;
  labels: PublicDetailTableLabels;
}) {
  const fullName = row.player_name?.trim() || "—";
  const cat = row.category_code?.trim() || "—";
  const code = row.player_code?.trim() || "—";
  const club = row.club_label?.trim();

  return (
    <div className="mb-2 rounded-lg border border-cyan-500/25 bg-[#0c1728]/95 px-2 py-2 sm:px-3">
      <p className="text-[12px] font-bold leading-snug text-white sm:text-sm">
        {fullName}
      </p>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[10px] leading-snug text-slate-300 sm:text-[11px]">
        <span>
          <span className="font-semibold text-cyan-200/95">
            {labels.detailExpandedCategoryLabel}
          </span>
          {": "}
          <span className="font-medium text-slate-100">{cat}</span>
        </span>
        <span className="font-mono text-[10px] text-slate-400 sm:text-[11px]">
          {code}
        </span>
        {club ? (
          <span className="min-w-0">
            <span className="font-semibold text-cyan-200/95">
              {labels.detailExpandedClubLabel}
            </span>
            {": "}
            <span className="break-words text-slate-200">{club}</span>
          </span>
        ) : null}
      </p>
    </div>
  );
}
