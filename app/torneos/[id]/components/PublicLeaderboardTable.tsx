"use client";

import Link from "next/link";
import { Fragment, useMemo } from "react";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import {
  formatMainTotalForRow,
  formatSecondaryTotalForRow,
  mainTotalColumnHeader,
  secondaryTotalColumnHeader,
} from "@/lib/leaderboard/competitionDisplay";
import {
  buildCompetitionRulesMap,
  buildHandicapMap,
  detailLabelsWithCompetitionRule,
  ruleForCategory,
} from "../lib/publicCompetitionContext";
import ClubLogoThumb from "@/components/public/ClubLogoThumb";
import FavoriteStar from "@/components/public/FavoriteStar";
import type { PublicCutLine } from "@/lib/cuts/computeCutLine";
import type { PublicDetailTableLabels } from "../lib/publicDetailTableLabels";
import type { LeaderboardRow } from "../lib/types";
import {
  publicLeaderboardScoreColumnNos,
  publicLeaderboardTableColSpan,
  publicLeaderboardTableMinWidthClassForScoreColumns,
} from "../lib/publicLeaderboardColumns";
import {
  buildDetailToggleHref,
  formatScoreOrDQ,
  formatThru,
  publicLeaderboardNameColumnClass,
  type SelectedRoundMeta,
} from "../lib/utils";
import PublicLeaderboardDetailTable from "./PublicLeaderboardDetailTable";
import {
  PublicLeaderboardRoundScoreCells,
  PublicLeaderboardRoundScoreHeaders,
} from "./PublicLeaderboardRoundScoreColumns";
import PublicLeaderboardExpandedPlayerBanner from "./PublicLeaderboardExpandedPlayerBanner";
import PublicLeaderboardPlayerName from "./PublicLeaderboardPlayerName";

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
  embed?: boolean;
  fromAdmin?: boolean;
  leaderboard: LeaderboardRow[];
  /** Para nombres compactos cuando `leaderboard` es un subconjunto filtrado (misma categoría que en la lista completa). */
  peerRowsForNameCompact?: LeaderboardRow[];
  emptyLeaderboardLabel?: string;
  view: "live" | "official";
  selectedCategoryId: string;
  selectedRound: SelectedRoundMeta | null;
  requestedDetailId: string;
  detailLabels: PublicDetailTableLabels;
  cutLine?: PublicCutLine | null;
  competitionRules?: CategoryCompetitionRule[];
  handicapsByPlayerId?: Record<string, number | null>;
  strokeIndexByHole?: Record<number, number>;
  headerCompetitionRule?: CategoryCompetitionRule | null;
};

export default function PublicLeaderboardTable({
  tournamentId,
  embed = false,
  fromAdmin = false,
  leaderboard,
  peerRowsForNameCompact,
  emptyLeaderboardLabel,
  view,
  selectedCategoryId,
  selectedRound,
  requestedDetailId,
  detailLabels,
  cutLine = null,
  competitionRules = [],
  handicapsByPlayerId = {},
  strokeIndexByHole: strokeIndexByHoleRecord = {},
  headerCompetitionRule = null,
}: PublicLeaderboardTableProps) {
  const rulesMap = useMemo(
    () => buildCompetitionRulesMap(competitionRules),
    [competitionRules]
  );
  const handicapMap = useMemo(
    () => buildHandicapMap(handicapsByPlayerId),
    [handicapsByPlayerId]
  );
  const strokeIndexMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const [hole, si] of Object.entries(strokeIndexByHoleRecord)) {
      const holeNo = Number(hole);
      const index = Number(si);
      if (holeNo >= 1 && holeNo <= 18 && index >= 1 && index <= 18) {
        map.set(holeNo, index);
      }
    }
    return map;
  }, [strokeIndexByHoleRecord]);
  const headerRule =
    headerCompetitionRule ??
    ruleForCategory(rulesMap, selectedCategoryId || null);
  const allCategoriesView = !selectedCategoryId;
  const colSecondary = allCategoriesView
    ? "GR"
    : secondaryTotalColumnHeader(headerRule);
  const colMain = allCategoriesView
    ? "SCR"
    : mainTotalColumnHeader(headerRule);
  const detailLabelsResolved = useMemo(
    () => detailLabelsWithCompetitionRule(detailLabels, headerRule),
    [detailLabels, headerRule]
  );

  const peerRows = peerRowsForNameCompact ?? leaderboard;
  const emptyLabel =
    emptyLeaderboardLabel ??
    "No hay jugadores para mostrar en esta vista.";
  const posW = view === "official" ? "w-[44px]" : "w-[50px]";
  const nameCol = publicLeaderboardNameColumnClass;
  const tableColSpan = publicLeaderboardTableColSpan(selectedRound);

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-[28px] border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <table
        className={`table-fixed w-full ${publicLeaderboardTableMinWidthClassForScoreColumns(publicLeaderboardScoreColumnNos(selectedRound).length)} border-separate border-spacing-0 text-[10px] text-white sm:text-[11px]`}
      >
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
            <PublicLeaderboardRoundScoreHeaders selectedRound={selectedRound} />
            <th
              className="w-[34px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[36px]"
              title={colSecondary}
            >
              {colSecondary}
            </th>
            <th
              className="w-[34px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[36px]"
              title={
                allCategoriesView
                  ? "Total según reglas de cada categoría (neto, gross o pts.)"
                  : mainTotalColumnHeader(headerRule)
              }
            >
              {colMain}
            </th>
          </tr>
        </thead>

        <tbody>
          {leaderboard.length === 0 ? (
            <tr>
              <td
                colSpan={tableColSpan}
                className="px-4 py-10 text-center text-sm text-slate-400"
              >
                {emptyLabel}
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
              const rowRule = ruleForCategory(rulesMap, row.category_id);
              const showCutDivider = Boolean(row.show_cut_divider);
              const cutDividerLabel =
                row.cut_divider_label ?? cutLine?.label ?? "CORTE";

              return (
                <Fragment key={row.entry_id}>
                  {showCutDivider ? (
                    <tr className="bg-amber-500/10">
                      <td
                        colSpan={tableColSpan}
                        className="border-b border-amber-400/40 px-2 py-1 text-center text-[9px] font-bold uppercase tracking-wide text-amber-200"
                      >
                        {cutDividerLabel}
                      </td>
                    </tr>
                  ) : null}
                  <tr
                    className={`group border-b border-white/10 bg-transparent align-top text-white transition hover:bg-white/[0.03] ${
                      row.made_cut === false ? "opacity-55" : ""
                    }`}
                  >
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
                          <PublicLeaderboardPlayerName
                            row={row}
                            peerRows={peerRows}
                          />
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
                            embed: embed || undefined,
                            fromAdmin: fromAdmin || undefined,
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

                    <PublicLeaderboardRoundScoreCells
                      row={row}
                      selectedRound={selectedRound}
                      rulesMap={rulesMap}
                      handicapByPlayerId={handicapMap}
                    />

                    <td className="w-[34px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[36px]">
                      {formatSecondaryTotalForRow(row, rowRule)}
                    </td>

                    <td className="w-[34px] border-b border-white/10 px-0.5 py-1 text-center text-[11px] font-bold text-white sm:text-[12px]">
                      {formatMainTotalForRow(row, rowRule)}
                    </td>
                  </tr>

                  {isOpen ? (
                    <tr>
                      <td
                        colSpan={tableColSpan}
                        className="border-b border-white/10 bg-[#08111f]/70 p-0 align-top sm:table-cell"
                      >
                        <div className="box-border w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain px-1 pb-2 pt-1.5 [-webkit-overflow-scrolling:touch] sm:px-2">
                          <PublicLeaderboardExpandedPlayerBanner
                            row={row}
                            labels={detailLabels}
                          />
                          <PublicLeaderboardDetailTable
                            row={row}
                            selectedRound={selectedRound}
                            labels={detailLabelsResolved}
                            competitionRule={ruleForCategory(
                              rulesMap,
                              row.category_id
                            )}
                            handicapIndex={
                              handicapMap.get(row.player_id) ?? null
                            }
                            strokeIndexByHole={strokeIndexMap}
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
