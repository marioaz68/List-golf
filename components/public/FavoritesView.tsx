"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import ClubLogoThumb from "./ClubLogoThumb";
import FavoriteStar from "./FavoriteStar";
import type { LeaderboardRow } from "@/app/torneos/[id]/lib/types";
import PublicLeaderboardDetailTable from "@/app/torneos/[id]/components/PublicLeaderboardDetailTable";
import PublicLeaderboardExpandedPlayerBanner from "@/app/torneos/[id]/components/PublicLeaderboardExpandedPlayerBanner";
import PublicLeaderboardPlayerName from "@/app/torneos/[id]/components/PublicLeaderboardPlayerName";
import {
  buildDetailToggleHref,
  formatRelativeOrDQ,
  formatScoreOrDQ,
  formatThru,
  holesCapturedForSelectedRound,
  publicLeaderboardNameColumnClass,
  publicLeaderboardTableMinWidthClass,
  type SelectedRoundMeta,
} from "@/app/torneos/[id]/lib/utils";
import type { PublicDetailTableLabels } from "@/app/torneos/[id]/lib/publicDetailTableLabels";

type FavoritesViewProps = {
  tournamentId: string;
  leaderboard: LeaderboardRow[];
  selectedRound?: SelectedRoundMeta | null;
  detailLabels: PublicDetailTableLabels;
  selectedCategoryId: string;
  requestedDetailId: string;
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

function compareFavoriteRows(
  a: LeaderboardRow,
  b: LeaderboardRow,
  selectedRound: SelectedRoundMeta | null
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

  const posA = a.selected_round_position_category ?? Number.POSITIVE_INFINITY;
  const posB = b.selected_round_position_category ?? Number.POSITIVE_INFINITY;
  if (posA !== posB) return posA - posB;

  if (
    a.total_to_par != null &&
    b.total_to_par != null &&
    a.total_to_par !== b.total_to_par
  ) {
    return a.total_to_par - b.total_to_par;
  }
  if (a.total_to_par != null && b.total_to_par == null) return -1;
  if (a.total_to_par == null && b.total_to_par != null) return 1;

  const thruA = holesCapturedForSelectedRound(
    a.details,
    selectedRound,
    a.category_id
  );
  const thruB = holesCapturedForSelectedRound(
    b.details,
    selectedRound,
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

export default function FavoritesView({
  tournamentId,
  leaderboard,
  selectedRound = null,
  detailLabels,
  selectedCategoryId,
  requestedDetailId,
}: FavoritesViewProps) {
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
      "favorites-changed",
      onFavoritesChanged as EventListener
    );

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(
        "favorites-changed",
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
      .sort((a, b) => compareFavoriteRows(a, b, selectedRound ?? null));
  }, [favoriteIds, leaderboard, hydrated, selectedRound]);

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

  return (
    <div className="w-full min-w-0 overflow-x-auto rounded-[28px] border border-white/10 bg-[#0c1728] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <table
        className={`table-fixed w-full ${publicLeaderboardTableMinWidthClass} border-separate border-spacing-0 text-[10px] text-white sm:text-[11px]`}
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
          {favoriteRows.map((row) => {
            const isOpen = requestedDetailId === row.entry_id;

            return (
              <Fragment key={row.entry_id}>
                <tr className="group border-b border-white/10 align-top text-white transition hover:bg-white/[0.03]">
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
                          categoryId: selectedCategoryId || null,
                          roundId: selectedRound?.id ?? null,
                          view: "favorites",
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
                    {row.selected_round_position_category ??
                      row.selected_round_position ??
                      "—"}
                  </td>

                  <td className="w-[26px] border-b border-white/10 px-0.5 py-1 text-center sm:w-[28px]">
                    {renderMove(
                      row.move_vs_previous_category ?? row.move_vs_previous
                    )}
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
                    {formatRelativeOrDQ(row.total_to_par, row.is_disqualified)}
                  </td>
                </tr>

                {isOpen ? (
                  <tr>
                    <td
                      colSpan={9}
                      className="border-b border-white/10 bg-[#08111f]/70 p-0 align-top sm:table-cell"
                    >
                      <div className="box-border w-full min-w-0 max-w-full overflow-x-auto overflow-y-visible overscroll-x-contain px-1 pb-2 pt-1.5 [-webkit-overflow-scrolling:touch] sm:px-2">
                        <PublicLeaderboardExpandedPlayerBanner
                          row={row}
                          labels={detailLabels}
                        />
                        <PublicLeaderboardDetailTable
                          row={row}
                          labels={detailLabels}
                          selectedRound={selectedRound ?? null}
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