"use client";

import { useMemo, useState } from "react";
import type { PublicDetailTableLabels } from "../lib/publicDetailTableLabels";
import type { LeaderboardRow } from "../lib/types";
import type { SelectedRoundMeta } from "../lib/utils";
import type { PublicCutLine } from "@/lib/cuts/computeCutLine";
import type { CategoryCompetitionRule } from "@/lib/leaderboard/categoryCompetitionRules";
import PublicLeaderboardTable from "./PublicLeaderboardTable";

function foldForSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
}

function rowMatchesSearch(row: LeaderboardRow, queryFolded: string) {
  const tokens = queryFolded.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const hay = foldForSearch(
    [
      row.player_name,
      row.club_label,
      row.category_code,
      row.player_code,
    ]
      .filter(Boolean)
      .join(" ")
  );

  return tokens.every((t) => hay.includes(t));
}

export type PublicLeaderboardSearchLabels = {
  placeholder: string;
  ariaLabel: string;
  hint: string;
  noMatches: string;
  leaderboardEmpty: string;
  countTemplate: string;
};

type Props = {
  tournamentId: string;
  embed?: boolean;
  fromAdmin?: boolean;
  fullLeaderboard: LeaderboardRow[];
  /** Lista completa (p. ej. live) para abreviaturas de nombre cuando `fullLeaderboard` es un subconjunto (vista oficial). */
  peerRowsForNameCompact?: LeaderboardRow[];
  view: "live" | "official";
  selectedCategoryId: string;
  selectedRound: SelectedRoundMeta | null;
  requestedDetailId: string;
  detailLabels: PublicDetailTableLabels;
  labels: PublicLeaderboardSearchLabels;
  cutLine?: PublicCutLine | null;
  competitionRules?: CategoryCompetitionRule[];
  handicapsByPlayerId?: Record<string, number | null>;
  strokeIndexByHole?: Record<number, number>;
  headerCompetitionRule?: CategoryCompetitionRule | null;
};

export default function PublicLeaderboardWithSearch({
  tournamentId,
  embed = false,
  fromAdmin = false,
  fullLeaderboard,
  peerRowsForNameCompact,
  view,
  selectedCategoryId,
  selectedRound,
  requestedDetailId,
  detailLabels,
  labels,
  cutLine = null,
  competitionRules = [],
  handicapsByPlayerId = {},
  strokeIndexByHole = {},
  headerCompetitionRule = null,
}: Props) {
  const [query, setQuery] = useState("");

  const queryFolded = useMemo(
    () => foldForSearch(query.trim()),
    [query]
  );

  const filtered = useMemo(() => {
    if (!queryFolded) return fullLeaderboard;
    return fullLeaderboard.filter((row) => rowMatchesSearch(row, queryFolded));
  }, [fullLeaderboard, queryFolded]);

  const emptyLabel =
    fullLeaderboard.length === 0
      ? labels.leaderboardEmpty
      : queryFolded && filtered.length === 0
        ? labels.noMatches
        : labels.leaderboardEmpty;

  const countLine =
    queryFolded && fullLeaderboard.length > 0
      ? labels.countTemplate
          .replace("{shown}", String(filtered.length))
          .replace("{total}", String(fullLeaderboard.length))
      : null;

  return (
    <div className="w-full min-w-0 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="public-lb-search">
            {labels.ariaLabel}
          </label>
          <input
            id="public-lb-search"
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={labels.placeholder}
            aria-label={labels.ariaLabel}
            className="w-full max-w-md rounded-xl border border-white/15 bg-[#0c1728] px-3 py-2 text-base text-white shadow-inner shadow-black/20 outline-none ring-cyan-400/40 placeholder:text-slate-500 focus:border-cyan-400/50 focus:ring-2 sm:text-sm"
          />
          <p className="mt-1.5 text-[11px] leading-snug text-slate-400 sm:text-xs">
            {labels.hint}
          </p>
        </div>
        {countLine ? (
          <p className="shrink-0 text-[11px] font-semibold tabular-nums text-cyan-200/90 sm:text-xs">
            {countLine}
          </p>
        ) : null}
      </div>

      <PublicLeaderboardTable
        tournamentId={tournamentId}
        embed={embed}
        fromAdmin={fromAdmin}
        leaderboard={filtered}
        peerRowsForNameCompact={peerRowsForNameCompact ?? fullLeaderboard}
        emptyLeaderboardLabel={emptyLabel}
        view={view}
        selectedCategoryId={selectedCategoryId}
        selectedRound={selectedRound}
        requestedDetailId={requestedDetailId}
        detailLabels={detailLabels}
        cutLine={cutLine}
        competitionRules={competitionRules}
        handicapsByPlayerId={handicapsByPlayerId}
        strokeIndexByHole={strokeIndexByHole}
        headerCompetitionRule={headerCompetitionRule}
      />
    </div>
  );
}
