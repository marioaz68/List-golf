"use client";

import { useEffect, useMemo, useState } from "react";
import ClubLogoThumb from "./ClubLogoThumb";
import FavoriteStar from "./FavoriteStar";
import type {
  HoleDetail,
  LeaderboardRow,
} from "@/app/torneos/[id]/lib/types";
import {
  formatThru,
  holesCapturedForSelectedRound,
  scoreMarker,
  selectLeaderboardDetailsForPlayer,
  type SelectedRoundMeta,
} from "@/app/torneos/[id]/lib/utils";
import type { PublicDetailTableLabels } from "@/app/torneos/[id]/lib/publicDetailTableLabels";

type FavoritesViewProps = {
  tournamentId: string;
  leaderboard: LeaderboardRow[];
  selectedRound?: SelectedRoundMeta | null;
  detailLabels: PublicDetailTableLabels;
};

function formatScore(value: number | null) {
  return value == null ? "—" : String(value);
}

function formatRelative(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

function subtotal(
  holes: HoleDetail[],
  start: number,
  end: number,
  field: "par" | "strokes"
): number | null {
  const segment = holes.slice(start, end);
  const hasAny = segment.some((hole) => hole[field] != null);
  if (!hasAny) return null;
  return segment.reduce((acc, hole) => acc + Number(hole[field] ?? 0), 0);
}

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

const stickyLabelBaseFav =
  "sticky left-0 border-b border-r border-white/10 shadow-[6px_0_14px_-6px_rgba(0,0,0,0.55)]";

function ThNineColFav({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <th className="border-b border-white/10 px-1 py-1.5 text-center font-semibold leading-tight">
      <span className="block text-[11px] font-bold text-cyan-50">{title}</span>
      <span className="mt-0.5 block whitespace-normal text-[8.5px] font-semibold text-cyan-200/85">
        {subtitle}
      </span>
    </th>
  );
}

function DetailTable({
  row,
  labels,
}: {
  row: LeaderboardRow;
  labels: PublicDetailTableLabels;
}) {
  const displayDetails = selectLeaderboardDetailsForPlayer(row);

  const baseRound =
    displayDetails.find((detail) =>
      detail.holes.some((hole) => hole.par != null)
    ) ??
    displayDetails[0] ??
    row.details.find((detail) => detail.holes.some((hole) => hole.par != null)) ??
    row.details[0] ??
    null;

  const baseHoles = baseRound?.holes ?? [];

  return (
    <div className="mt-2 overflow-x-auto rounded-[24px] border border-white/10 bg-[#08111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300">
        <ClubLogoThumb
          clubId={row.club_id}
          size={28}
          title={row.club_label ?? undefined}
        />
        <div className="min-w-0">
          {row.player_code}
          {row.club_label ? ` • ${row.club_label}` : ""}
          {row.category_code ? ` • ${row.category_code}` : ""}
        </div>
      </div>

      <table className="w-full min-w-[1300px] border-separate border-spacing-0 text-[11px] text-white">
        <thead>
          <tr className="bg-gradient-to-r from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50">
            <th
              className={`${stickyLabelBaseFav} z-20 min-w-[72px] bg-cyan-950 px-2 py-2 text-left font-semibold`}
            >
              {labels.holesCol}
            </th>
            {Array.from({ length: 18 }, (_, i) => (
              <th
                key={`hdr-${row.entry_id}-${i + 1}`}
                className="whitespace-nowrap border-b border-white/10 px-1 py-2 text-center font-semibold"
              >
                {i + 1}
              </th>
            ))}
            <ThNineColFav title={labels.firstNineTitle} subtitle={labels.firstNineSub} />
            <ThNineColFav title={labels.secondNineTitle} subtitle={labels.secondNineSub} />
            <ThNineColFav title={labels.totalTitle} subtitle={labels.totalSub} />
            <th className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {labels.gross}
            </th>
            <th className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {labels.toPar}
            </th>
            <th className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {labels.pos}
            </th>
          </tr>
        </thead>

        <tbody>
          <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
            <td
              className={`${stickyLabelBaseFav} z-20 min-w-[72px] bg-emerald-950 px-2 py-2 font-semibold`}
            >
              {labels.parRow}
            </td>

            {Array.from({ length: 18 }, (_, i) => {
              const hole = baseHoles[i];
              return (
                <td
                  key={`par-${row.entry_id}-${i + 1}`}
                  className="border-b border-white/10 px-1 py-2 text-center font-semibold"
                >
                  {formatScore(hole?.par ?? null)}
                </td>
              );
            })}

            <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {formatScore(subtotal(baseHoles, 0, 9, "par"))}
            </td>
            <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {formatScore(subtotal(baseHoles, 9, 18, "par"))}
            </td>
            <td className="border-b border-white/10 px-1 py-2 text-center font-semibold">
              {formatScore(subtotal(baseHoles, 0, 18, "par"))}
            </td>
            <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
            <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
            <td className="border-b border-white/10 px-1 py-2 text-center">—</td>
          </tr>

          {displayDetails.map((detail, detailIndex) => {
            const standing =
              row.standing_by_round_category.find((s) => s.round_id === detail.round_id) ??
              null;

            const stripeBg =
              detailIndex % 2 === 0 ? "bg-[#0c1928]" : "bg-[#0b1728]";

            return (
              <tr
                key={`detail-${row.entry_id}-${detail.round_id}`}
                className={
                  detailIndex % 2 === 0
                    ? "bg-white/[0.03] text-white"
                    : "bg-[#0b1728] text-white"
                }
              >
                <td
                  className={`${stickyLabelBaseFav} z-10 min-w-[72px] px-2 py-1.5 font-semibold text-cyan-100 ${stripeBg}`}
                >
                  R{detail.round_no}
                </td>

                {detail.holes.map((hole) => {
                  const marker = scoreMarker(hole.strokes, hole.par);

                  return (
                    <td
                      key={`score-${row.entry_id}-${detail.round_id}-${hole.hole_number}`}
                      className="border-b border-white/10 px-1 py-1 text-center"
                    >
                      <span className={marker.wrapper}>
                        {marker.outer ? <span aria-hidden className={marker.outer} /> : null}
                        {marker.inner ? <span aria-hidden className={marker.inner} /> : null}
                        <span
                          className={`relative z-10 text-[11px] font-semibold ${marker.textClass}`}
                        >
                          {formatScore(hole.strokes)}
                        </span>
                      </span>
                    </td>
                  );
                })}

                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatScore(detail.out_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatScore(detail.in_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatScore(detail.total_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatScore(detail.gross_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatRelative(detail.to_par)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {standing?.pos ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function FavoritesView({
  tournamentId,
  leaderboard,
  selectedRound = null,
  detailLabels,
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

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] border-collapse text-[12px]">
        <thead>
          <tr className="bg-white/10 text-slate-300">
            <th className="w-[48px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              ★
            </th>
            <th className="w-[72px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              POS CAT
            </th>
            <th className="w-[70px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              MOVE
            </th>
            <th className="w-[84px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              CÓDIGO
            </th>
            <th className="w-[180px] border-b border-white/10 px-3 py-2 text-left font-semibold">
              JUGADOR
            </th>
            <th className="w-[70px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              THRU
            </th>
            <th className="w-[78px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              CAT
            </th>
            <th className="w-[78px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              HOY
            </th>
            <th className="w-[78px] border-b border-white/10 px-2 py-2 text-center font-semibold">
              TOTAL
            </th>
          </tr>
        </thead>

        <tbody>
          {favoriteRows.map((row) => (
            <tr
              key={row.entry_id}
              className="border-b border-white/5 align-top text-white"
            >
              <td className="px-2 py-1.5 text-center">
                <FavoriteStar
                  tournamentId={tournamentId}
                  playerId={row.player_id}
                />
              </td>

              <td className="px-2 py-1 text-center text-[18px] font-semibold text-cyan-300">
                {row.selected_round_position_category ??
                  row.selected_round_position ??
                  "—"}
              </td>

              <td className="px-2 py-1 text-center">
                {renderMove(
                  row.move_vs_previous_category ?? row.move_vs_previous
                )}
              </td>

              <td className="px-2 py-1 text-center font-mono text-[11px] text-slate-300">
                {row.player_code}
              </td>

              <td className="px-3 py-1">
                <details className="group">
                  <summary className="cursor-pointer list-none">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0">
                        <div className="truncate text-[12px] font-semibold leading-tight text-white">
                          {row.player_name}
                        </div>

                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400">
                          <ClubLogoThumb
                            clubId={row.club_id}
                            size={22}
                            title={row.club_label ?? undefined}
                          />
                          {row.category_code ? (
                            <>
                              <span>•</span>
                              <span>{row.category_code}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div
                        className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded border border-cyan-400/30 bg-cyan-400/10 text-[11px] font-semibold text-cyan-300"
                        title="Ver detalle"
                        aria-label="Ver detalle"
                      >
                        ▾
                      </div>
                    </div>
                  </summary>

                  <DetailTable row={row} labels={detailLabels} />
                </details>
              </td>

              <td className="px-2 py-1 text-center font-semibold text-sky-300">
                {formatThru(row.details, selectedRound, row.category_id)}
              </td>

              <td className="px-2 py-1 text-center">
                {row.category_code ?? "—"}
              </td>

              <td className="px-2 py-1 text-center font-semibold">
                {formatRelative(row.selected_round_to_par)}
              </td>

              <td className="px-2 py-1 text-center font-semibold text-cyan-300">
                {formatRelative(row.total_to_par)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}