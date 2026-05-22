import Link from "next/link";
import type { PublicDetailTableLabels } from "../lib/publicDetailTableLabels";
import type { LeaderboardRow } from "../lib/types";

const sep = (
  <span className="shrink-0 select-none text-slate-500" aria-hidden>
    ·
  </span>
);

/**
 * Al expandir el detalle hoyo por hoyo, la fila principal suele mostrar nombre abreviado.
 * Una sola fila compacta (scroll horizontal si no cabe) con nombre completo y meta.
 */
export default function PublicLeaderboardExpandedPlayerBanner({
  row,
  labels,
  handicapSummary,
  closeHref,
}: {
  row: LeaderboardRow;
  labels: PublicDetailTableLabels;
  handicapSummary?: string | null;
  /** Misma URL que el toggle del nombre (cierra el detalle). */
  closeHref?: string;
}) {
  const fullName = row.player_name?.trim() || "—";
  const cat = row.category_code?.trim() || "—";
  const code = row.player_code?.trim() || "—";
  const club = row.club_label?.trim();

  return (
    <div className="mb-1.5 flex min-w-0 items-start gap-2 rounded-lg border border-cyan-500/25 bg-[#0c1728]/95 py-1.5 pl-2 pr-1.5 text-[10px] leading-tight text-slate-200 sm:text-[11px]">
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-x-1 overflow-x-auto [-webkit-overflow-scrolling:touch]">
      <span className="shrink-0 font-bold text-white">{fullName}</span>
      {sep}
      <span className="shrink-0 whitespace-nowrap">
        <span className="font-semibold text-cyan-200/95">
          {labels.detailExpandedCategoryLabel}
        </span>
        <span className="text-slate-500">:</span>
        <span className="font-medium text-slate-100">{cat}</span>
      </span>
      {sep}
      <span className="shrink-0 whitespace-nowrap font-mono text-slate-300">
        {code}
      </span>
      {club ? (
        <>
          {sep}
          <span className="min-w-0 shrink whitespace-nowrap">
            <span className="font-semibold text-cyan-200/95">
              {labels.detailExpandedClubLabel}
            </span>
            <span className="text-slate-500">:</span>
            <span className="text-slate-100">{club}</span>
          </span>
        </>
      ) : null}
      {handicapSummary ? (
        <>
          {sep}
          <span className="shrink-0 whitespace-nowrap font-medium text-amber-200/95">
            {handicapSummary}
          </span>
        </>
      ) : null}
      </div>
      {closeHref ? (
        <Link
          scroll={false}
          href={closeHref}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2.5 py-1.5 text-[10px] font-semibold text-slate-100 transition hover:border-white/25 hover:bg-white/10 sm:min-h-[32px] sm:text-[11px]"
          aria-label={labels.detailCloseAria}
        >
          <span aria-hidden className="text-sm leading-none">
            ✕
          </span>
          <span>{labels.detailCloseButton}</span>
        </Link>
      ) : null}
    </div>
  );
}
