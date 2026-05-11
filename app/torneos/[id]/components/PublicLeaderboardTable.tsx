import Link from "next/link";
import { Fragment } from "react";
import FavoriteStar from "@/components/public/FavoriteStar";
import type { LeaderboardRow } from "../lib/types";
import {
  buildDetailToggleHref,
  formatRelativeOrDQ,
  formatScoreOrDQ,
  formatThru,
} from "../lib/utils";
import PublicLeaderboardDetailTable from "./PublicLeaderboardDetailTable";

function renderMove(move: number | null) {
  if (move == null || move === 0) {
    return <span className="text-slate-500">—</span>;
  }

  if (move > 0) {
    return (
      <span className="inline-flex items-center gap-1 font-semibold text-emerald-400">
        <span>▲</span>
        <span>{move}</span>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 font-semibold text-rose-400">
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
  selectedRoundId: string | null;
  requestedDetailId: string;
};

export default function PublicLeaderboardTable({
  tournamentId,
  leaderboard,
  view,
  selectedCategoryId,
  selectedRoundId,
  requestedDetailId,
}: PublicLeaderboardTableProps) {
  return (
    <div className="w-full overflow-x-auto rounded-[28px] border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <table className="w-full min-w-[1140px] table-auto border-collapse text-[12px]">
        <thead>
          <tr className="bg-white/10 text-slate-300">
            <th className="w-[42px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              ★
            </th>

            {view === "official" ? (
              <th className="w-[54px] border-b border-white/10 px-1 py-2 text-center font-semibold">
                POS
              </th>
            ) : (
              <th className="w-[62px] border-b border-white/10 px-1 py-2 text-center font-semibold">
                POS CAT
              </th>
            )}

            <th className="w-[34px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              MV
            </th>
            <th className="w-[46px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              COD
            </th>
            <th className="min-w-[320px] border-b border-white/10 px-2 py-2 text-left font-semibold">
              JUGADOR
            </th>
            <th className="w-[44px] border-b border-white/10 px-1 py-2 text-left font-semibold">
              CLUB
            </th>
            <th className="w-[34px] border-b border-white/10 px-1 py-2 text-left font-semibold">
              CAT
            </th>
            <th className="w-[40px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              THRU
            </th>
            <th className="w-[46px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              RONDA
            </th>
            <th className="w-[46px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              TOTAL
            </th>
            <th className="w-[52px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              GROSS
            </th>
          </tr>
        </thead>

        <tbody>
          {leaderboard.length === 0 ? (
            <tr>
              <td
                colSpan={12}
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
                  : row.selected_round_position_category ?? "—";

              const move = row.is_disqualified
                ? null
                : view === "official"
                  ? row.move_vs_previous
                  : row.move_vs_previous_category;

              const isOpen = requestedDetailId === row.entry_id;

              return (
                <Fragment key={row.entry_id}>
                  <tr className="border-b border-white/10 bg-transparent align-top text-white transition hover:bg-white/[0.03]">
                    <td className="px-1 py-2 text-center">
                      <FavoriteStar
                        tournamentId={tournamentId}
                        playerId={row.player_id}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm leading-none transition hover:bg-white/10"
                      />
                    </td>

                    <td className="px-1 py-2 text-center font-bold text-cyan-300">
                      {position}
                    </td>

                    <td className="px-1 py-2 text-center">{renderMove(move)}</td>

                    <td className="px-1 py-2 text-center font-mono text-[11px] text-slate-300">
                      {row.player_code}
                    </td>

                    <td className="w-full px-2 py-2">
                      <div className="flex min-w-0 w-full items-center gap-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="flex min-w-0 w-full items-center gap-1.5">
                            <span
                              title={row.player_name}
                              className="block min-w-0 w-full overflow-hidden text-ellipsis whitespace-nowrap text-[14px] font-semibold leading-tight text-white"
                            >
                              {row.player_name}
                            </span>

                            {row.is_disqualified ? (
                              <span className="shrink-0 inline-flex rounded border border-red-400/40 bg-red-500/10 px-1.5 py-[1px] text-[10px] font-bold text-red-300">
                                DQ
                              </span>
                            ) : null}
                          </div>
                        </div>

                        <Link
                          href={buildDetailToggleHref({
                            tournamentId,
                            categoryId: selectedCategoryId || null,
                            roundId: selectedRoundId,
                            view,
                            currentDetailId: requestedDetailId || null,
                            nextDetailId: row.entry_id,
                          })}
                          className="inline-flex h-6 w-5 shrink-0 items-center justify-center rounded border border-cyan-400/30 bg-cyan-400/10 text-[10px] font-semibold text-cyan-300 transition hover:bg-cyan-400/15"
                          aria-label={isOpen ? "Ocultar detalle" : "Ver detalle"}
                        >
                          {isOpen ? "▴" : "▾"}
                        </Link>
                      </div>
                    </td>

                    <td className="px-1 py-2 text-slate-300">
                      {row.club_label ?? "—"}
                    </td>

                    <td className="px-1 py-2 text-slate-300">
                      {row.category_code ?? "—"}
                    </td>

                    <td className="px-1 py-2 text-center font-semibold text-slate-200">
                      {formatThru(row.details, selectedRoundId)}
                    </td>

                    <td className="px-1 py-2 text-center font-semibold text-slate-200">
                      {formatRelativeOrDQ(
                        row.selected_round_to_par,
                        row.is_disqualified
                      )}
                    </td>

                    <td className="px-1 py-2 text-center font-bold text-white">
                      {formatRelativeOrDQ(
                        row.total_to_par,
                        row.is_disqualified
                      )}
                    </td>

                    <td className="px-1 py-2 text-center font-semibold text-slate-200">
                      {formatScoreOrDQ(row.total_gross, row.is_disqualified)}
                    </td>
                  </tr>

                  {isOpen ? (
                    <tr>
                      <td
                        colSpan={12}
                        className="border-b border-white/10 bg-[#08111f]/70 px-3 pb-4 pt-2"
                      >
                        <div className="mx-auto w-full max-w-[1400px]">
                          <PublicLeaderboardDetailTable row={row} />
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
