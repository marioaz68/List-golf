import Link from "next/link";
import { Fragment } from "react";
import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import FavoriteStar from "@/components/public/FavoriteStar";
import type { PublicDetailTableLabels } from "../lib/publicDetailTableLabels";
import type { LeaderboardRow } from "../lib/types";
import {
  buildDetailToggleHref,
  formatRelativeOrDQ,
  formatScoreOrDQ,
  formatThru,
  publicLeaderboardCompactPlayerName,
  type SelectedRoundMeta,
} from "../lib/utils";
import PublicLeaderboardDetailTable from "./PublicLeaderboardDetailTable";

const stickyNameHead =
  "sticky left-0 z-[18] border-b border-r border-white/10 bg-[#1a2838] shadow-[6px_0_14px_-4px_rgba(0,0,0,0.5)]";
const stickyNameBody =
  "sticky left-0 z-[18] border-b border-r border-white/10 bg-[#0c1728] shadow-[6px_0_14px_-4px_rgba(0,0,0,0.5)] group-hover:bg-[#101c2c]";

function renderMove(move: number | null) {
  if (move == null || move === 0) {
    return <span className="text-slate-500">—</span>;
  }

  if (move > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-emerald-400">
        <span>▲</span>
        <span>{move}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-rose-400">
      <span>▼</span>
      <span>{Math.abs(move)}</span>
    </span>
  );
}

type PublicLeaderboardTableProps = {
  tournamentId: string;
  leaderboard: LeaderboardRow[];
  view: "live" | "official";
  selectedCategoryId: string;
  selectedRound: SelectedRoundMeta | null;
  requestedDetailId: string;
  detailLabels: PublicDetailTableLabels;
};

export default function PublicLeaderboardTable({
  tournamentId,
  leaderboard,
  view,
  selectedCategoryId,
  selectedRound,
  requestedDetailId,
  detailLabels,
}: PublicLeaderboardTableProps) {
  const posW = view === "official" ? "w-[44px]" : "w-[50px]";
  const nameCol = "w-[92px] min-w-[92px] max-w-[120px] sm:w-[112px] sm:min-w-[112px] sm:max-w-none";

  return (
    <div className="w-full overflow-x-auto rounded-[28px] border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <table className="w-full min-w-[520px] border-separate border-spacing-0 text-[10px] text-white sm:text-[11px]">
        <thead>
          <tr className="bg-white/10 text-slate-300">
            <th
              className="w-[32px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[34px]"
              title="Club"
            >
              C
            </th>
            <th
              className={`${stickyNameHead} ${nameCol} px-1 py-1.5 text-left text-[9px] font-semibold sm:px-1.5`}
            >
              JUG
            </th>
            <th className="w-[30px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[32px]">
              ★
            </th>
            {view === "official" ? (
              <th
                className={`${posW} border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold`}
              >
                POS
              </th>
            ) : (
              <th
                className={`${posW} border-b border-white/10 px-0.5 py-1.5 text-center text-[8px] font-semibold leading-tight`}
              >
                POS
              </th>
            )}
            <th
              className="w-[26px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[28px]"
              title="Movimiento vs la posición de la ronda anterior (a partir de R2)"
            >
              MV
            </th>
            <th className="w-[32px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[34px]">
              THR
            </th>
            <th className="w-[32px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[34px]">
              HOY
            </th>
            <th className="w-[34px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[36px]">
              GR
            </th>
            <th className="w-[34px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[36px]">
              TOT
            </th>
          </tr>
        </thead>

        <tbody>
          {leaderboard.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="px-4 py-10 text-center text-sm text-slate-400"
              >
                No hay jugadores para mostrar en esta vista.
              </td>
            </tr>
          ) : (
            leaderboard.map((row, index) => {
              const position = row.is_disqualified
                ? "DQ"
                : view === "official"
                  ? row.selected_round_position ?? index + 1
                  : row.selected_round_position_category ??
                    row.selected_round_position ??
                    index + 1;

              const move = row.is_disqualified
                ? null
                : view === "official"
                  ? row.move_vs_previous
                  : row.move_vs_previous_category;

              const isOpen = requestedDetailId === row.entry_id;
              const shortName = publicLeaderboardCompactPlayerName(
                row,
                leaderboard
              );

              return (
                <Fragment key={row.entry_id}>
                  <tr className="group border-b border-white/10 bg-transparent align-top text-white transition hover:bg-white/[0.03]">
                    <td className="w-[32px] border-b border-white/10 px-0.5 py-1 text-center align-middle sm:w-[34px]">
                      <div className="inline-flex justify-center">
                        <ClubLogoThumb
                          clubId={row.club_id}
                          size={24}
                          title={row.club_label ?? undefined}
                        />
                      </div>
                    </td>

                    <td
                      className={`${stickyNameBody} ${nameCol} px-1 py-1 sm:px-1.5`}
                    >
                      <div className="flex min-w-0 items-center gap-0.5">
                        <div className="min-w-0 flex-1">
                          <div
                            title={row.player_name}
                            className="truncate text-[10px] font-semibold leading-tight text-white sm:text-[11px]"
                          >
                            {shortName}
                          </div>
                          <div
                            className="truncate font-mono text-[8px] leading-tight text-slate-500 sm:text-[9px]"
                            title={row.player_code}
                          >
                            {row.player_code}
                          </div>
                          {row.is_disqualified ? (
                            <span className="mt-0.5 inline-flex rounded border border-red-400/40 bg-red-500/10 px-0.5 text-[8px] font-bold text-red-300">
                              DQ
                            </span>
                          ) : null}
                        </div>
                        <Link
                          scroll={false}
                          href={buildDetailToggleHref({
                            tournamentId,
                            categoryId: selectedCategoryId || null,
                            roundId: selectedRound?.id ?? null,
                            view,
                            currentDetailId: requestedDetailId || null,
                            nextDetailId: row.entry_id,
                          })}
                          className="inline-flex h-4 w-3.5 shrink-0 items-center justify-center rounded border border-cyan-400/30 bg-cyan-400/10 text-[8px] font-semibold text-cyan-300 sm:h-5 sm:w-4 sm:text-[9px]"
                          aria-label={isOpen ? "Ocultar detalle" : "Ver detalle"}
                        >
                          {isOpen ? "▴" : "▾"}
                        </Link>
                      </div>
                    </td>

                    <td className="w-[30px] border-b border-white/10 px-0.5 py-1 text-center sm:w-[32px]">
                      <FavoriteStar
                        tournamentId={tournamentId}
                        playerId={row.player_id}
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-white/10 bg-white/5 text-[10px] leading-none transition hover:bg-white/10 sm:h-6 sm:w-6"
                      />
                    </td>

                    <td
                      className={`${posW} border-b border-white/10 px-0.5 py-1 text-center text-[11px] font-bold text-cyan-300 sm:text-[12px]`}
                    >
                      {position}
                    </td>

                    <td className="w-[26px] border-b border-white/10 px-0.5 py-1 text-center sm:w-[28px]">
                      {renderMove(move)}
                    </td>

                    <td className="w-[32px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[34px]">
                      {formatThru(row.details, selectedRound, row.category_id)}
                    </td>

                    <td className="w-[32px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[34px]">
                      {formatRelativeOrDQ(
                        row.selected_round_to_par,
                        row.is_disqualified
                      )}
                    </td>

                    <td className="w-[34px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[36px]">
                      {formatScoreOrDQ(row.total_gross, row.is_disqualified)}
                    </td>

                    <td className="w-[34px] border-b border-white/10 px-0.5 py-1 text-center text-[11px] font-bold text-white sm:text-[12px]">
                      {formatRelativeOrDQ(
                        row.total_to_par,
                        row.is_disqualified
                      )}
                    </td>
                  </tr>

                  {isOpen ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="border-b border-white/10 bg-[#08111f]/70 p-0 align-top"
                      >
                        <div className="w-full min-w-0 px-1 pb-2 pt-1.5 sm:px-2">
                          <PublicLeaderboardDetailTable
                            row={row}
                            selectedRound={selectedRound}
                            labels={detailLabels}
                          />
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
