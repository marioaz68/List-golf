"use client";

import { useMemo } from "react";

function buildPublicLeaderboardSrc(
  tournamentId: string,
  params: {
    view?: string;
    category_id?: string;
    round_id?: string;
    detail_id?: string;
    from_admin?: boolean;
  }
) {
  const sp = new URLSearchParams();
  sp.set("embed", "1");
  if (params.from_admin) sp.set("from", "admin");
  if (params.view) sp.set("view", params.view);
  if (params.category_id) sp.set("category_id", params.category_id);
  if (params.round_id) sp.set("round_id", params.round_id);
  if (params.detail_id) sp.set("detail_id", params.detail_id);
  return `/torneos/${tournamentId}?${sp.toString()}`;
}

export default function LeaderboardTournamentEmbed({
  tournamentId,
  view = "official",
  categoryId = "",
  roundId = "",
  detailId = "",
  tournamentName,
}: {
  tournamentId: string;
  view?: string;
  categoryId?: string;
  roundId?: string;
  detailId?: string;
  tournamentName?: string | null;
}) {
  const embedParams = useMemo(
    () => ({
      view,
      category_id: categoryId || undefined,
      round_id: roundId || undefined,
      detail_id: detailId || undefined,
      from_admin: true,
    }),
    [view, categoryId, roundId, detailId]
  );

  const src = useMemo(
    () => buildPublicLeaderboardSrc(tournamentId, embedParams),
    [tournamentId, embedParams]
  );

  const publicHref = useMemo(() => {
    const sp = new URLSearchParams();
    if (view) sp.set("view", view);
    if (categoryId) sp.set("category_id", categoryId);
    if (roundId) sp.set("round_id", roundId);
    if (detailId) sp.set("detail_id", detailId);
    const qs = sp.toString();
    return qs ? `/torneos/${tournamentId}?${qs}` : `/torneos/${tournamentId}`;
  }, [tournamentId, view, categoryId, roundId, detailId]);

  return (
    <div className="flex min-h-[min(72vh,900px)] flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/10 bg-[#0c1728] px-3 py-2 text-xs text-slate-300">
        <span>
          Vista integrada (admin)
          {tournamentName ? (
            <>
              {" "}
              · <span className="font-semibold text-white">{tournamentName}</span>
            </>
          ) : null}
        </span>
        <a
          href={publicHref}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-cyan-300 underline-offset-2 hover:text-cyan-200 hover:underline"
        >
          Abrir en página pública ↗
        </a>
      </div>

      <iframe
        key={src}
        src={src}
        title={
          tournamentName
            ? `Leaderboard — ${tournamentName}`
            : "Leaderboard del torneo"
        }
        className="min-h-[min(calc(100dvh-12rem),900px)] w-full flex-1 rounded-xl border border-white/10 bg-[#08111f]"
      />
    </div>
  );
}
