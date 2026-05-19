"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  isStablefordCategory,
  type CategoryCompetitionRule,
} from "@/lib/leaderboard/categoryCompetitionRules";
import {
  mainTotalColumnHeader,
  secondaryTotalColumnHeader,
} from "@/lib/leaderboard/competitionDisplay";
import {
  buildCompetitionRulesMap,
  buildHandicapMap,
  detailLabelsWithCompetitionRule,
  ruleForCategory,
} from "@/app/torneos/[id]/lib/publicCompetitionContext";
import ClubLogoThumb from "./ClubLogoThumb";
import FavoriteStar from "./FavoriteStar";
import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import PublicLeaderboardDetailTable from "@/app/torneos/[id]/components/PublicLeaderboardDetailTable";
import PublicLeaderboardExpandedPlayerBanner from "@/app/torneos/[id]/components/PublicLeaderboardExpandedPlayerBanner";
import PublicLeaderboardPlayerName from "@/app/torneos/[id]/components/PublicLeaderboardPlayerName";
import { PUBLIC_LEADERBOARD_FIXED_COL_COUNT } from "@/app/torneos/[id]/lib/publicLeaderboardColumns";
import {
  buildDetailToggleHref,
  formatThru,
  holesCapturedForSelectedRound,
  publicLeaderboardNameColumnClass,
  type SelectedRoundMeta,
} from "@/app/torneos/[id]/lib/utils";
import type { PublicCutLine } from "@/lib/cuts/computeCutLine";
import type { LockedScorecardLookups } from "@/lib/leaderboard/lockedScorecards";
import type { RoundLike } from "@/lib/leaderboard/roundCategoryMatch";
import type { PublicDetailTableLabels } from "@/app/torneos/[id]/lib/publicDetailTableLabels";
import type { LeaderboardViewOverride } from "@/lib/leaderboard/leaderboardViewOverride";
import { formatPlayingHandicapSummary } from "@/lib/leaderboard/perHoleCompetition";
import {
  favoritePlayerMove,
  favoritePlayerStanding,
  resolveFavoritePlayerDisplayRound,
} from "@/lib/leaderboard/favoritePlayerDisplayRound";
import {
  effectiveUsesNetLeaderboard,
  usesGrossHoleByHoleDetail,
} from "@/lib/leaderboard/leaderboardViewOverride";
import { formatRelativeOrDQ, formatScoreOrDQ } from "@/app/torneos/[id]/lib/utils";
import type { RoundStandingSnapshot } from "@/app/torneos/[id]/lib/types";

type FavoritesViewProps = {
  tournamentId: string;
  leaderboard: LeaderboardRow[];
  selectedRound?: SelectedRoundMeta | null;
  detailLabels: PublicDetailTableLabels;
  selectedCategoryId: string;
  requestedDetailId: string;
  cutLine?: PublicCutLine | null;
  competitionRules?: CategoryCompetitionRule[];
  handicapsByPlayerId?: Record<string, number | null>;
  strokeIndexByHole?: Record<number, number>;
  leaderboardViewOverride?: LeaderboardViewOverride | null;
  rounds: RoundLike[];
  lockedLookups: LockedScorecardLookups;
};

function categoryBucket(code: string | null | undefined) {
  const value = (code ?? "").trim().toLowerCase();

  if (!value) return 0;
  if (/(dama|damas|lady|ladies|women|woman|femen)/i.test(value)) return 2;
  if (/(senior|seniors|sr\b|ssr|super\s*senior|supersenior|master)/i.test(value)) {
    return 3;
  }

  return 1;
}

function extractCategoryHandicapSeed(code: string | null | undefined) {
  const raw = (code ?? "").trim();
  if (!raw) return Number.POSITIVE_INFINITY;

  const numericMatches = Array.from(raw.matchAll(/\d+(?:\.\d+)?/g))
    .map((match) => Number(match[0]))
    .filter((value) => Number.isFinite(value));

  if (numericMatches.length > 0) {
    return Math.min(...numericMatches);
  }

  const normalized = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const compact = normalized.replace(/[^A-Z]/g, "");
  const romanMap: Record<string, number> = {
    I: 1,
    II: 2,
    III: 3,
    IV: 4,
    V: 5,
    VI: 6,
    VII: 7,
    VIII: 8,
    IX: 9,
    X: 10,
  };

  if (compact in romanMap) {
    return romanMap[compact];
  }

  if (/^[A-Z]$/.test(compact)) {
    return compact.charCodeAt(0) - 64;
  }

  const firstLetter = compact.match(/[A-Z]/)?.[0];
  if (firstLetter) {
    return firstLetter.charCodeAt(0) - 64;
  }

  return Number.POSITIVE_INFINITY;
}

function formatFavoriteMainTotal(
  row: LeaderboardRow,
  standing: RoundStandingSnapshot | null,
  rule: CategoryCompetitionRule,
  viewOverride: LeaderboardViewOverride | null | undefined
) {
  if (row.is_disqualified) return "DQ";
  if (isStablefordCategory(rule)) {
    return formatScoreOrDQ(row.stableford_total ?? standing?.to_par ?? null, false);
  }
  const toPar = standing?.to_par ?? row.total_to_par;
  if (effectiveUsesNetLeaderboard(rule, viewOverride)) {
    return formatRelativeOrDQ(toPar, false);
  }
  return formatRelativeOrDQ(toPar, row.is_disqualified);
}

function formatFavoriteSecondaryTotal(
  row: LeaderboardRow,
  standing: RoundStandingSnapshot | null,
  rule: CategoryCompetitionRule
) {
  if (row.is_disqualified) return "DQ";
  return formatScoreOrDQ(standing?.gross ?? row.total_gross, false);
}

function compareFavoriteRows(
  a: LeaderboardRow,
  b: LeaderboardRow,
  rounds: RoundLike[]
) {
  const bucketA = categoryBucket(a.category_code);
  const bucketB = categoryBucket(b.category_code);

  if (bucketA !== bucketB) return bucketA - bucketB;

  if (bucketA === 1 && bucketB === 1) {
    const handicapA = extractCategoryHandicapSeed(a.category_code);
    const handicapB = extractCategoryHandicapSeed(b.category_code);

    if (handicapA !== handicapB) return handicapA - handicapB;
  }

  const categoryA = a.category_code ?? "";
  const categoryB = b.category_code ?? "";
  const byCategoryLabel = categoryA.localeCompare(categoryB, "es", {
    sensitivity: "base",
    numeric: true,
  });

  if (byCategoryLabel !== 0) return byCategoryLabel;

  const roundA = resolveFavoritePlayerDisplayRound(a, rounds);
  const roundB = resolveFavoritePlayerDisplayRound(b, rounds);
  const stA = favoritePlayerStanding(a, roundA?.id);
  const stB = favoritePlayerStanding(b, roundB?.id);

  const posA = stA?.pos ?? Number.POSITIVE_INFINITY;
  const posB = stB?.pos ?? Number.POSITIVE_INFINITY;
  if (posA !== posB) return posA - posB;

  const toParA = stA?.to_par ?? a.total_to_par;
  const toParB = stB?.to_par ?? b.total_to_par;
  if (toParA != null && toParB != null && toParA !== toParB) {
    return toParA - toParB;
  }
  if (toParA != null && toParB == null) return -1;
  if (toParA == null && toParB != null) return 1;

  const thruA = holesCapturedForSelectedRound(
    a.details,
    roundA,
    a.category_id
  );
  const thruB = holesCapturedForSelectedRound(
    b.details,
    roundB,
    b.category_id
  );
  if (thruA !== thruB) return thruB - thruA;

  return a.player_name.localeCompare(b.player_name, "es", {
    sensitivity: "base",
  });
}

function normalizeFavoriteToken(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean ? clean : null;
}

function collectFavoriteCandidates(
  value: unknown,
  collected: Set<string>,
  tournamentId: string
) {
  if (value == null) return;

  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) return;

    raw
      .split(/[,\n|]/g)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => collected.add(item));

    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFavoriteCandidates(item, collected, tournamentId);
    }
    return;
  }

  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;

    const directCandidates = [
      obj.playerId,
      obj.player_id,
      obj.entryId,
      obj.entry_id,
      obj.id,
      obj.code,
      obj.playerCode,
      obj.player_code,
    ];

    for (const candidate of directCandidates) {
      const token = normalizeFavoriteToken(candidate);
      if (token) collected.add(token);
    }

    const nestedTournamentKeys = [
      tournamentId,
      `tournament:${tournamentId}`,
      `torneo:${tournamentId}`,
      "players",
      "playerIds",
      "player_ids",
      "entries",
      "entryIds",
      "entry_ids",
      "favorites",
      "items",
      "rows",
      "data",
    ];

    for (const key of nestedTournamentKeys) {
      if (key in obj) {
        collectFavoriteCandidates(obj[key], collected, tournamentId);
      }
    }

    for (const nestedValue of Object.values(obj)) {
      if (
        typeof nestedValue === "string" ||
        Array.isArray(nestedValue) ||
        (nestedValue && typeof nestedValue === "object")
      ) {
        collectFavoriteCandidates(nestedValue, collected, tournamentId);
      }
    }
  }
}

function readFavoriteIds(tournamentId: string): string[] {
  if (typeof window === "undefined") return [];

  const candidates = [
    "listgolf:favorites",
    "favorites",
    "favoritePlayers",
    "list-golf-favorites",
    `favorites:${tournamentId}`,
    `listgolf:favorites:${tournamentId}`,
    `tournament:${tournamentId}:favorites`,
    `torneo:${tournamentId}:favoritos`,
  ];

  const collected = new Set<string>();

  for (const key of candidates) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw) as unknown;
      collectFavoriteCandidates(parsed, collected, tournamentId);
    } catch {
      collectFavoriteCandidates(raw, collected, tournamentId);
    }
  }

  return Array.from(collected);
}

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

const stickyNameHeadFav =
  "sticky left-0 z-[18] border-b border-r border-white/10 bg-[#1a2838] shadow-[6px_0_14px_-4px_rgba(0,0,0,0.5)]";
const stickyNameBodyFav =
  "sticky left-0 z-[18] border-b border-r border-white/10 bg-[#0c1728] shadow-[6px_0_14px_-4px_rgba(0,0,0,0.5)] group-hover:bg-[#101c2c]";

/** Sin columnas R1/R2/R3: fijas + totales. */
const FAVORITES_TABLE_COL_SPAN = PUBLIC_LEADERBOARD_FIXED_COL_COUNT + 2;

export default function FavoritesView({
  tournamentId,
  leaderboard,
  selectedRound = null,
  detailLabels,
  selectedCategoryId,
  requestedDetailId,
  cutLine = null,
  competitionRules = [],
  handicapsByPlayerId = {},
  strokeIndexByHole: strokeIndexByHoleRecord = {},
  leaderboardViewOverride = null,
  rounds,
  lockedLookups,
}: FavoritesViewProps) {
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
  const defaultHeaderRule = useMemo(
    () => ruleForCategory(rulesMap, selectedCategoryId || null),
    [rulesMap, selectedCategoryId]
  );

  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      setFavoriteIds(readFavoriteIds(tournamentId));
      setHydrated(true);
    };

    read();

    const onStorage = () => read();
    const onFavoritesChanged = () => read();

    window.addEventListener("storage", onStorage);
    window.addEventListener(
      "listgolf-favorites-changed",
      onFavoritesChanged as EventListener
    );

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "listgolf-favorites-changed",
        onFavoritesChanged as EventListener
      );
    };
  }, [tournamentId]);

  const favoriteRows = useMemo(() => {
    if (!hydrated) return [];

    const favoriteSet = new Set(
      favoriteIds.map((value) => value.trim()).filter(Boolean)
    );

    return leaderboard
      .filter((row) => {
        const candidates = [row.player_id, row.entry_id, row.player_code]
          .map((value) => value?.trim())
          .filter(Boolean) as string[];

        return candidates.some((candidate) => favoriteSet.has(candidate));
      })
      .sort((a, b) => compareFavoriteRows(a, b, rounds));
  }, [favoriteIds, leaderboard, hydrated, rounds]);

  if (!hydrated) {
    return (
      <div className="px-4 py-6 text-sm text-slate-400">
        Cargando favoritos...
      </div>
    );
  }

  if (favoriteRows.length === 0) {
    return (
      <div className="px-4 py-6 text-sm text-slate-400">
        No tienes jugadores marcados como favoritos todavía.
      </div>
    );
  }

  const nameCol = publicLeaderboardNameColumnClass;
  const tableColSpan = FAVORITES_TABLE_COL_SPAN;

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-[28px] border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <table
        className="table-fixed w-full min-w-[520px] border-separate border-spacing-0 text-[10px] text-white sm:min-w-[680px] sm:text-[11px]"
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
              className={`${stickyNameHeadFav} ${nameCol} px-1 py-1.5 text-left text-[9px] font-semibold sm:px-1.5`}
            >
              JUG
            </th>
            <th className="w-[30px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[32px]">
              ★
            </th>
            <th className="w-[50px] border-b border-white/10 px-0.5 py-1.5 text-center text-[8px] font-semibold leading-tight sm:w-[52px]">
              POS
            </th>
            <th
              className="w-[26px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[28px]"
              title="Movimiento vs la posición de la ronda anterior (a partir de R2)"
            >
              MV
            </th>
            <th className="w-[32px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[34px]">
              THR
            </th>
            <th className="w-[34px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[36px]">
              {secondaryTotalColumnHeader(defaultHeaderRule)}
            </th>
            <th className="w-[34px] border-b border-white/10 px-0.5 py-1.5 text-center text-[9px] font-semibold sm:w-[36px]">
              {mainTotalColumnHeader(defaultHeaderRule)}
            </th>
          </tr>
        </thead>

        <tbody>
          {favoriteRows.map((row, index) => {
            const rowRule = ruleForCategory(rulesMap, row.category_id);
            const playerRound = resolveFavoritePlayerDisplayRound(row, rounds);
            const playerStanding = favoritePlayerStanding(
              row,
              playerRound?.id
            );
            const rowDetailLabels = detailLabelsWithCompetitionRule(
              detailLabels,
              rowRule,
              leaderboardViewOverride
            );
            const isOpen = requestedDetailId === row.entry_id;
            const showCutDivider = false;
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
                  className={`group border-b border-white/10 align-top text-white transition hover:bg-white/[0.03] ${
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

                  <td className={`${stickyNameBodyFav} ${nameCol} px-1 py-1 sm:px-1.5`}>
                    <div className="flex min-w-0 items-center gap-0.5">
                      <div className="min-w-0 flex-1">
                        <PublicLeaderboardPlayerName
                          row={row}
                          peerRows={leaderboard}
                        />
                        <div
                          className="truncate font-mono text-[8px] leading-tight text-slate-500 sm:text-[9px]"
                          title={row.player_code}
                        >
                          {row.player_code}
                        </div>
                        {row.category_code ? (
                          <div className="mt-0.5 truncate text-[8px] text-slate-400 sm:text-[9px]">
                            {row.category_code}
                          </div>
                        ) : null}
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
                          categoryId: row.category_id || null,
                          view: "favorites",
                          basis: leaderboardViewOverride ?? undefined,
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

                  <td className="w-[50px] border-b border-white/10 px-0.5 py-1 text-center text-[11px] font-bold text-cyan-300 sm:w-[52px] sm:text-[12px]">
                    {playerStanding?.pos ?? "—"}
                  </td>

                  <td className="w-[26px] border-b border-white/10 px-0.5 py-1 text-center sm:w-[28px]">
                    {renderMove(
                      favoritePlayerMove(row, playerRound, rounds)
                    )}
                  </td>

                  <td className="w-[32px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[34px]">
                    {formatThru(row.details, playerRound, row.category_id)}
                  </td>

                  <td className="w-[34px] border-b border-white/10 px-0.5 py-1 text-center font-semibold text-slate-200 sm:w-[36px]">
                    {formatFavoriteSecondaryTotal(row, playerStanding, rowRule)}
                  </td>

                  <td className="w-[34px] border-b border-white/10 px-0.5 py-1 text-center text-[11px] font-bold text-white sm:text-[12px]">
                    {formatFavoriteMainTotal(
                      row,
                      playerStanding,
                      rowRule,
                      leaderboardViewOverride
                    )}
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
                          labels={rowDetailLabels}
                          handicapSummary={
                            usesGrossHoleByHoleDetail(
                              rowRule,
                              leaderboardViewOverride
                            )
                              ? null
                              : formatPlayingHandicapSummary(
                                  handicapMap.get(row.player_id) ?? null,
                                  rowRule.handicap_percentage
                                )
                          }
                        />
                        <PublicLeaderboardDetailTable
                          row={row}
                          labels={rowDetailLabels}
                          selectedRound={playerRound}
                          competitionRule={rowRule}
                          handicapIndex={
                            handicapMap.get(row.player_id) ?? null
                          }
                          strokeIndexByHole={strokeIndexMap}
                          leaderboardViewOverride={leaderboardViewOverride}
                        />
                      </div>
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}