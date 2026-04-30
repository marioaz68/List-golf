import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";
import { createClient } from "@/utils/supabase/server";
import FavoriteStar from "@/components/public/FavoriteStar";
import FavoritesView from "@/components/public/FavoritesView";
import { buildLiveLeaderboard } from "@/lib/leaderboard/buildLiveLeaderboard";
import { applyStandings } from "@/lib/leaderboard/applyStandings";
import { applyCompetitionRules } from "@/lib/leaderboard/applyCompetitionRules";

type Tournament = {
  id: string;
  name: string | null;
  start_date: string | null;
  is_public: boolean | null;
};

type ClubRef = {
  name: string | null;
  short_name: string | null;
};

type EntryPlayer = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  club: string | null;
  club_id: string | null;
  clubs: ClubRef | ClubRef[] | null;
};

type EntryCategory = {
  id: string;
  code: string | null;
  name: string | null;
};

type TournamentEntryJoinRow = {
  id: string;
  player_id: string;
  category_id: string | null;
  status: string | null;
  player: EntryPlayer | EntryPlayer[] | null;
  category: EntryCategory | EntryCategory[] | null;
};

type ValidTournamentEntry = {
  id: string;
  player_id: string;
  category_id: string | null;
  status: string | null;
  player: EntryPlayer;
  category: EntryCategory | null;
};

type RoundRow = {
  id: string;
  round_no: number;
  round_date: string | null;
};

type RoundScoreRow = {
  id: string;
  round_id: string;
  player_id: string;
  gross_score: number | null;
};

type HoleScoreRow = {
  round_score_id: string;
  hole_number: number;
  strokes: number | null;
};

type TournamentHoleRow = {
  hole_number: number | null;
  par: number | null;
};

type HoleDetail = {
  hole_number: number;
  par: number | null;
  strokes: number | null;
};

type RoundDetail = {
  round_id: string;
  round_no: number;
  round_date: string | null;
  gross_score: number | null;
  to_par: number | null;
  out_score: number | null;
  in_score: number | null;
  total_score: number | null;
  holes: HoleDetail[];
  is_dq: boolean;
};

type RoundStandingSnapshot = {
  round_id: string;
  round_no: number;
  pos: number | null;
  to_par: number | null;
  gross: number | null;
  played_rounds: number;
};

export type LeaderboardRow = {
  entry_id: string;
  player_id: string;
  player_name: string;
  player_code: string;
  club_label: string | null;
  category_id: string | null;
  category_code: string | null;
  entry_status: string | null;
  is_disqualified: boolean;
  total_to_par: number | null;
  selected_round_to_par: number | null;
  total_gross: number | null;
  selected_round_position: number | null;
  previous_round_position: number | null;
  move_vs_previous: number | null;
  selected_round_position_category: number | null;
  previous_round_position_category: number | null;
  move_vs_previous_category: number | null;
  rounds: Array<{
    round_id: string;
    round_no: number;
    gross_score: number | null;
    is_dq: boolean;
  }>;
  details: RoundDetail[];
  standing_by_round: RoundStandingSnapshot[];
  standing_by_round_category: RoundStandingSnapshot[];
  hasScores: boolean;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

function oneOrNull<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function normalizeCategory(
  value: EntryCategory | EntryCategory[] | null | undefined
): EntryCategory | null {
  return oneOrNull(value);
}

function normalizeClubLabel(value: ClubRef | ClubRef[] | null | undefined) {
  const club = oneOrNull(value);
  const label = (club?.short_name ?? club?.name ?? "").trim();
  return label || null;
}

function isDQScore(value: number | null | undefined) {
  return value != null && Number(value) >= 400;
}

function isDQStatus(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase() === "dq";
}

function toValidEntry(row: TournamentEntryJoinRow): ValidTournamentEntry | null {
  const player = oneOrNull(row.player);
  if (!player?.id || !row.player_id) return null;

  return {
    id: row.id,
    player_id: row.player_id,
    category_id: row.category_id,
    status: row.status ?? null,
    player,
    category: normalizeCategory(row.category),
  };
}

function formatDate(date: string | null) {
  if (!date) return "Fecha por definir";

  return new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

function formatScore(value: number | null) {
  return value == null ? "—" : String(value);
}

function formatScoreOrDQ(value: number | null, isDQ: boolean) {
  if (isDQ) return "DQ";
  return formatScore(value);
}

function formatRelative(value: number | null) {
  if (value == null) return "—";
  if (value === 0) return "E";
  return value > 0 ? `+${value}` : String(value);
}

function formatRelativeOrDQ(value: number | null, isDQ: boolean) {
  if (isDQ) return "DQ";
  return formatRelative(value);
}

function buildHref(params: {
  tournamentId: string;
  categoryId?: string | null;
  roundId?: string | null;
  view?: string | null;
  detailId?: string | null;
}) {
  const sp = new URLSearchParams();

  if (params.view) sp.set("view", params.view);
  if (params.categoryId) sp.set("category_id", params.categoryId);
  if (params.roundId) sp.set("round_id", params.roundId);
  if (params.detailId) sp.set("detail_id", params.detailId);

  const qs = sp.toString();

  return qs
    ? `/torneos/${params.tournamentId}?${qs}`
    : `/torneos/${params.tournamentId}`;
}

function buildDetailToggleHref(params: {
  tournamentId: string;
  categoryId?: string | null;
  roundId?: string | null;
  view?: string | null;
  currentDetailId?: string | null;
  nextDetailId?: string | null;
}) {
  return buildHref({
    tournamentId: params.tournamentId,
    categoryId: params.categoryId ?? null,
    roundId: params.roundId ?? null,
    view: params.view ?? null,
    detailId:
      params.currentDetailId === params.nextDetailId
        ? null
        : params.nextDetailId ?? null,
  });
}

function buildScorecardsHref(params: {
  tournamentId: string;
  roundId?: string | null;
}) {
  const sp = new URLSearchParams();
  sp.set("tournament_id", params.tournamentId);

  if (params.roundId) {
    sp.set("round_id", params.roundId);
  }

  return `/scorecards?${sp.toString()}`;
}

function pillClasses(active: boolean) {
  return active
    ? "inline-flex min-h-8 items-center justify-center rounded-md border border-cyan-300 bg-gradient-to-b from-cyan-300 to-cyan-500 px-3 text-[11px] font-bold leading-none text-[#08111f] shadow-[0_3px_0_#0e7490,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-cyan-200 hover:to-cyan-400"
    : "inline-flex min-h-8 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700";
}

function adminPillClasses() {
  return "inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600";
}

function sectionPillClasses(active: boolean) {
  return active
    ? "inline-flex min-h-7 items-center justify-center rounded-md border border-cyan-300 bg-gradient-to-b from-cyan-300 to-cyan-500 px-2.5 text-[11px] font-bold leading-none text-[#08111f] shadow-[0_2px_0_#0e7490,0_3px_7px_rgba(0,0,0,0.22)] transition hover:from-cyan-200 hover:to-cyan-400"
    : "inline-flex min-h-7 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-2.5 text-[11px] font-bold leading-none text-white shadow-[0_2px_0_#0f172a,0_3px_7px_rgba(0,0,0,0.22)] transition hover:from-slate-600 hover:to-slate-700";
}

function getPlayerCode(index: number) {
  return `J${String(index + 1).padStart(3, "0")}`;
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

function holesPlayedCount(details: RoundDetail[]) {
  return details.reduce(
    (acc, detail) =>
      acc + detail.holes.filter((hole) => hole.strokes != null).length,
    0
  );
}

function holesCapturedInRound(
  details: RoundDetail[],
  roundId: string | null | undefined
) {
  if (!roundId) return 0;

  const round = details.find((detail) => detail.round_id === roundId);
  if (!round) return 0;
  if (round.is_dq) return 18;

  return round.holes.filter((hole) => hole.strokes != null).length;
}

function formatThru(details: RoundDetail[], roundId: string | null | undefined) {
  const round = details.find((detail) => detail.round_id === roundId);
  if (round?.is_dq) return "DQ";

  const count = holesCapturedInRound(details, roundId);

  if (count <= 0) return "—";
  if (count >= 18) return "F";
  return String(count);
}

function scoreMarker(
  strokes: number | null,
  par: number | null
): {
  wrapper: string;
  outer?: string;
  inner?: string;
  textClass: string;
} {
  if (strokes == null) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
      textClass: "text-slate-500",
    };
  }

  if (par == null) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
      textClass: "text-white",
    };
  }

  const diff = Number(strokes) - Number(par);

  if (diff <= -2) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full",
      outer:
        "pointer-events-none absolute inset-0 block rounded-full border-[2px] border-rose-400 bg-rose-500/12 shadow-[0_0_0_1px_rgba(251,113,133,0.2)]",
      inner:
        "pointer-events-none absolute inset-[4px] block rounded-full border-[2px] border-rose-300",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  if (diff === -1) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-full",
      outer:
        "pointer-events-none absolute inset-[3px] block rounded-full border-[2px] border-rose-400 bg-rose-500/12",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  if (diff >= 2) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-[4px]",
      outer:
        "pointer-events-none absolute inset-0 block rounded-[4px] border-[2px] border-amber-200 bg-amber-100/8",
      inner:
        "pointer-events-none absolute inset-[4px] block rounded-[2px] border-[2px] border-amber-100",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  if (diff === 1) {
    return {
      wrapper:
        "relative inline-flex h-7 w-7 items-center justify-center rounded-[4px]",
      outer:
        "pointer-events-none absolute inset-[3px] block rounded-[2px] border-[2px] border-amber-100 bg-amber-100/8",
      textClass: "relative z-10 font-bold text-white",
    };
  }

  return {
    wrapper:
      "relative inline-flex h-7 w-7 items-center justify-center rounded-md",
    textClass: "text-white",
  };
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

function DetailTable({ row }: { row: LeaderboardRow }) {
  const baseRound =
    row.details.find((detail) => detail.holes.some((hole) => hole.par != null)) ??
    row.details[0] ??
    null;

  const baseHoles = baseRound?.holes ?? [];

  return (
    <div className="mx-auto mt-2 w-full max-w-full overflow-x-auto rounded-[24px] border border-white/10 bg-[#08111f] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="border-b border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] font-semibold text-slate-300">
        {row.player_code}
        {row.club_label ? ` • ${row.club_label}` : ""}
        {row.category_code ? ` • ${row.category_code}` : ""}
        {row.is_disqualified ? ` • DQ` : ""}
      </div>

      <table className="w-full min-w-[960px] table-fixed border-collapse text-[10px] text-white sm:text-[11px]">
        <thead>
          <tr className="bg-gradient-to-r from-cyan-950 via-sky-900 to-cyan-950 text-cyan-50">
            <th className="w-[70px] border-b border-white/10 px-2 py-2 text-left font-semibold">
              HOYOS
            </th>

            {Array.from({ length: 18 }, (_, i) => (
              <th
                key={`hdr-${row.entry_id}-${i + 1}`}
                className="w-[34px] border-b border-white/10 px-1 py-2 text-center font-semibold"
              >
                {i + 1}
              </th>
            ))}

            <th className="w-[48px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              OUT
            </th>
            <th className="w-[48px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              IN
            </th>
            <th className="w-[48px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              TOT
            </th>
            <th className="w-[52px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              GROSS
            </th>
            <th className="w-[64px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              TO PAR
            </th>
            <th className="w-[44px] border-b border-white/10 px-1 py-2 text-center font-semibold">
              POS
            </th>
          </tr>
        </thead>

        <tbody>
          <tr className="bg-gradient-to-r from-emerald-950 via-teal-900 to-emerald-950 text-emerald-100">
            <td className="border-b border-white/10 px-2 py-2 font-semibold">
              Par
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

          {row.details.map((detail, detailIndex) => {
            const standing =
              row.standing_by_round.find((s) => s.round_id === detail.round_id) ??
              null;

            return (
              <tr
                key={`detail-${row.entry_id}-${detail.round_id}`}
                className={
                  detailIndex % 2 === 0
                    ? "bg-white/[0.03] text-white"
                    : "bg-[#0b1728] text-white"
                }
              >
                <td className="border-b border-white/10 px-2 py-1.5 font-semibold text-cyan-100">
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
                          className={`relative z-10 text-[10px] font-semibold ${marker.textClass}`}
                        >
                          {formatScore(hole.strokes)}
                        </span>
                      </span>
                    </td>
                  );
                })}

                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : formatScore(detail.out_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : formatScore(detail.in_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : formatScore(detail.total_score)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatScoreOrDQ(detail.gross_score, detail.is_dq)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {formatRelativeOrDQ(detail.to_par, detail.is_dq)}
                </td>
                <td className="border-b border-white/10 px-1 py-1.5 text-center font-semibold">
                  {detail.is_dq ? "DQ" : standing?.pos ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function PublicTournamentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{
    category_id?: string;
    round_id?: string;
    view?: string;
    detail_id?: string;
  }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};

  const requestedCategoryId =
    typeof sp.category_id === "string" ? sp.category_id.trim() : "";
  const requestedRoundId =
    typeof sp.round_id === "string" ? sp.round_id.trim() : "";
  const requestedView =
    typeof sp.view === "string" ? sp.view.trim().toLowerCase() : "";
  const requestedDetailId =
    typeof sp.detail_id === "string" ? sp.detail_id.trim() : "";

  const view =
    requestedView === "official"
      ? "official"
      : requestedView === "favorites"
        ? "favorites"
        : "live";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoggedIn = !!user;

  const tournamentResponse = isLoggedIn
    ? await supabase
        .from("tournaments")
        .select("id,name,start_date,is_public,poster_path")
        .eq("id", id)
        .maybeSingle()
    : await supabase
        .from("tournaments")
        .select("id,name,start_date,is_public,poster_path")
        .eq("id", id)
        .eq("is_public", true)
        .maybeSingle();

  const { data: tournament, error: tournamentError } = tournamentResponse;

  if (tournamentError || !tournament) {
    notFound();
  }

  const typedTournament = tournament as Tournament & { poster_path?: string | null };
  const posterUrl = typedTournament.poster_path
    ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/tournament-posters/${typedTournament.poster_path}`
    : null;

  const { data: entriesData, error: entriesError } = await supabase
    .from("tournament_entries")
    .select(`
      id,
      player_id,
      category_id,
      status,
      player:players (
        id,
        first_name,
        last_name,
        club,
        club_id,
        clubs:clubs (
          name,
          short_name
        )
      ),
      category:categories (
        id,
        code,
        name
      )
    `)
    .eq("tournament_id", typedTournament.id)
    .limit(500);

  if (entriesError) {
    throw new Error(`Error leyendo tournament_entries: ${entriesError.message}`);
  }

  const allEntries = ((entriesData ?? []) as TournamentEntryJoinRow[])
    .map(toValidEntry)
    .filter((entry): entry is ValidTournamentEntry => !!entry);

  const categories = Array.from(
    new Map(
      allEntries
        .map((entry) =>
          entry.category ? [entry.category.id, entry.category] : null
        )
        .filter((x): x is [string, EntryCategory] => !!x)
    ).values()
  ).sort((a, b) =>
    (a.code ?? a.name ?? "").localeCompare(b.code ?? b.name ?? "", "es", {
      sensitivity: "base",
    })
  );

  const selectedCategoryId = categories.some((c) => c.id === requestedCategoryId)
    ? requestedCategoryId
    : "";

  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId) ?? null
    : null;

  const filteredEntries = selectedCategoryId
    ? allEntries.filter((entry) => entry.category_id === selectedCategoryId)
    : allEntries;

  const { data: roundsData, error: roundsError } = await supabase
    .from("rounds")
    .select("id, round_no, round_date")
    .eq("tournament_id", typedTournament.id)
    .order("round_no", { ascending: true });

  if (roundsError) {
    throw new Error(`Error leyendo rounds: ${roundsError.message}`);
  }

  const rounds = (roundsData ?? []) as RoundRow[];

  const { data: roundScoresData, error: roundScoresError } =
    filteredEntries.length > 0 && rounds.length > 0
      ? await supabase
          .from("round_scores")
          .select("id, round_id, player_id, gross_score")
          .in("player_id", filteredEntries.map((entry) => entry.player_id))
          .in("round_id", rounds.map((r) => r.id))
      : { data: [], error: null };

  if (roundScoresError) {
    throw new Error(`Error leyendo round_scores: ${roundScoresError.message}`);
  }

  const roundScores = (roundScoresData ?? []) as RoundScoreRow[];

  const { data: holeScoresData, error: holeScoresError } =
    roundScores.length > 0
      ? await supabase
          .from("hole_scores")
          .select("round_score_id, hole_number, strokes")
          .in(
            "round_score_id",
            roundScores.map((row) => row.id)
          )
      : { data: [], error: null };

  if (holeScoresError) {
    throw new Error(`Error leyendo hole_scores: ${holeScoresError.message}`);
  }

  const holeScores = (holeScoresData ?? []) as HoleScoreRow[];

  const { data: tournamentHolesData, error: tournamentHolesError } =
    await supabase
      .from("tournament_holes")
      .select("hole_number, par")
      .eq("tournament_id", typedTournament.id)
      .order("hole_number", { ascending: true });

  if (tournamentHolesError) {
    throw new Error(
      `Error leyendo tournament_holes: ${tournamentHolesError.message}`
    );
  }

  const tournamentHoles = (tournamentHolesData ?? []) as TournamentHoleRow[];

  const parByHole = new Map<number, number>();
  for (const row of tournamentHoles) {
    const holeNumber = Number(row.hole_number ?? 0);
    const par = Number(row.par ?? 0);
    if (!holeNumber || !par) continue;
    parByHole.set(holeNumber, par);
  }

  const capturedRoundIds = Array.from(
    new Set(roundScores.map((score) => score.round_id))
  );

  const latestRoundWithScores =
    [...rounds]
      .filter((round) => capturedRoundIds.includes(round.id))
      .sort((a, b) => a.round_no - b.round_no)
      .at(-1) ?? null;

  const selectedRound =
    rounds.find((round) => round.id === requestedRoundId) ??
    latestRoundWithScores ??
    rounds[0] ??
    null;

  const holeScoresByRoundScoreId = new Map<string, HoleScoreRow[]>();
  for (const row of holeScores) {
    const current = holeScoresByRoundScoreId.get(row.round_score_id) ?? [];
    current.push(row);
    holeScoresByRoundScoreId.set(row.round_score_id, current);
  }

  const { data: competitionRulesData } = await supabase
    .from("competition_rules")
    .select("*")
    .eq("tournament_id", typedTournament.id)
    .maybeSingle();

  const { data: scorecardsData } = await supabase
  .from("scorecards")
  .select("entry_id, round_id, locked_at")
  .not("locked_at", "is", null);

const lockedScorecardMap = new Set(
  (scorecardsData ?? []).map(
    (sc) => `${sc.entry_id}_${sc.round_id}`
  )
);
const categoryStatusMap: Record<
  string,
  { total: number; closed: number }
> = {};

filteredEntries.forEach((entry) => {
  const cat = entry.category?.code ?? "SIN CAT";

  if (!categoryStatusMap[cat]) {
    categoryStatusMap[cat] = { total: 0, closed: 0 };
  }

  categoryStatusMap[cat].total += 1;

  const hasClosedRound = rounds.some((round) =>
    lockedScorecardMap.has(`${entry.id}_${round.id}`)
  );

  if (hasClosedRound) {
    categoryStatusMap[cat].closed += 1;
  }
});
  const leaderboardBase: LeaderboardRow[] = buildLiveLeaderboard({
    filteredEntries,
    rounds,
    roundScores,
    holeScoresByRoundScoreId,
    parByHole,
    lockedScorecardMap,
    selectedRound,
    normalizeClubLabel,
    isDQScore,
    isDQStatus,
    subtotal,
    getPlayerCode,
  });

  const leaderboardWithStandings: LeaderboardRow[] = applyStandings({
    leaderboardBase,
    rounds,
    selectedRound,
    holesPlayedCount,
  });

  const leaderboard: LeaderboardRow[] = applyCompetitionRules({
    leaderboard: leaderboardWithStandings,
    competitionRules: competitionRulesData,
  });

  const playersWithScores = leaderboard.filter((row) => row.hasScores).length;
  const playersPendingScores = Math.max(filteredEntries.length - playersWithScores, 0);

  const pageTitle =
    view === "official"
      ? "Resultados oficiales"
      : view === "favorites"
        ? "Mis favoritos"
        : "Live Scoring";

  const pageDescription =
    view === "official"
      ? "Resultados verificados por la administración del torneo."
      : view === "favorites"
        ? "Seguimiento rápido de los jugadores marcados como favoritos."
        : "Resultados en tiempo real del torneo con avances de captura y posiciones por categoría.";

  return (
    <main className="min-h-screen bg-[#08111f] text-white">
      <section className="relative overflow-hidden border-b border-white/10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_80%_20%,rgba(16,185,129,0.12),transparent_25%)]" />

        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                href="/"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700"
              >
                ← Inicio
              </Link>

              <Link
                href="/#torneos"
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-slate-600 bg-gradient-to-b from-slate-700 to-slate-800 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#0f172a,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-slate-600 hover:to-slate-700"
              >
                Ver torneos
              </Link>

              {isLoggedIn ? (
                <Link href="/tournaments" className={adminPillClasses()}>
                  Ir a lista de torneos
                </Link>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "live",
                })}
                className={pillClasses(view === "live")}
              >
                Live Scoring
              </Link>

              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "official",
                })}
                className={pillClasses(view === "official")}
              >
                Leaderboard
              </Link>

              <Link
                href={buildHref({
                  tournamentId: typedTournament.id,
                  categoryId: selectedCategoryId || null,
                  roundId: selectedRound?.id ?? null,
                  view: "favorites",
                })}
                className={pillClasses(view === "favorites")}
              >
                Favoritos
              </Link>

              <Link
                href={buildScorecardsHref({
                  tournamentId: typedTournament.id,
                  roundId: selectedRound?.id ?? null,
                })}
                className="inline-flex min-h-8 items-center justify-center rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 px-3 text-[11px] font-bold leading-none text-white shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600"
              >
                ✍️ Firma electrónica
              </Link>
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-[auto,1fr,0.85fr] lg:items-end">
            {posterUrl ? (
              <div className="flex justify-center lg:justify-start">
                <div className="relative h-40 w-28 overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl shadow-black/30">
                  <img
                    src={posterUrl}
                    alt="Poster torneo"
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ) : null}

            <div>
              <div className="mb-3 inline-flex items-center rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
                Torneo público
              </div>

              <h1 className="max-w-4xl text-3xl font-black tracking-tight text-white sm:text-4xl lg:text-5xl">
                {typedTournament.name ?? "Sin nombre"}
              </h1>

              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {formatDate(typedTournament.start_date)}
                </span>

                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                  {filteredEntries.length} jugador
                  {filteredEntries.length === 1 ? "" : "es"}
                </span>

                <span className="rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-300">
                  {pageTitle}
                </span>

                {selectedCategory ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    Categoría: {selectedCategory.code ?? selectedCategory.name ?? "—"}
                  </span>
                ) : null}

                {selectedRound ? (
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200">
                    Ronda {selectedRound.round_no}
                  </span>
                ) : null}
              </div>

              <p className="mt-5 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                {pageDescription}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-4 shadow-2xl shadow-cyan-950/20 backdrop-blur">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-[#0c1728] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Rondas
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {rounds.length}
                  </p>
                </div>

                <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/10 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-200">
                    Capturados
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {playersWithScores}
                  </p>
                </div>

                <div className="rounded-2xl border border-white/10 bg-[#0c1728] p-4">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Pendientes
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">
                    {playersPendingScores}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {(categories.length > 0 || rounds.length > 0) && (
            <div className="mt-6 flex flex-col gap-3">
              {categories.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  <Link
                    href={buildHref({
                      tournamentId: typedTournament.id,
                      roundId: selectedRound?.id ?? null,
                      view,
                    })}
                    className={sectionPillClasses(!selectedCategoryId)}
                  >
                    Todas las categorías
                  </Link>

                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      href={buildHref({
                        tournamentId: typedTournament.id,
                        categoryId: category.id,
                        roundId: selectedRound?.id ?? null,
                        view,
                      })}
                      className={sectionPillClasses(selectedCategoryId === category.id)}
                    >
                      {category.code ?? category.name ?? "Sin categoría"}
                    </Link>
                  ))}
                </div>
              ) : null}

              {rounds.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {rounds.map((round) => (
                    <Link
                      key={round.id}
                      href={buildHref({
                        tournamentId: typedTournament.id,
                        categoryId: selectedCategoryId || null,
                        roundId: round.id,
                        view,
                      })}
                      className={sectionPillClasses(selectedRound?.id === round.id)}
                    >
                      R{round.round_no}
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#08111f]">
        <div className="mx-auto w-full max-w-[1600px] px-3 py-8 sm:px-4 lg:px-6 xl:px-8">
          {view === "official" ? (
  <div className="mb-4 flex flex-wrap gap-2">
    {Object.entries(categoryStatusMap)
      .sort((a, b) => a[0].localeCompare(b[0], "es", { sensitivity: "base" }))
      .map(([cat, stats]) => {
        const pending = Math.max(stats.total - stats.closed, 0);

        return (
          <div
            key={cat}
            className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold text-cyan-200"
          >
            {cat}: {stats.closed}/{stats.total} cerradas
            {pending > 0 ? ` • faltan ${pending}` : " • completo"}
          </div>
        );
      })}
  </div>
) : null}     
          {view === "favorites" ? (
            <div className="rounded-[28px] border border-white/10 bg-[#0c1728] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
              <FavoritesView
                tournamentId={typedTournament.id}
                leaderboard={leaderboard}
                selectedRoundId={selectedRound?.id ?? null}
              />
            </div>
          ) : (
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
                      const position =
                        row.is_disqualified
                          ? "DQ"
                          : view === "official"
                            ? row.selected_round_position ?? index + 1
                            : row.selected_round_position_category ?? "—";

                      const move =
                        row.is_disqualified
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
                                tournamentId={typedTournament.id}
                                playerId={row.player_id}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/5 text-sm leading-none transition hover:bg-white/10"
                              />
                            </td>

                            <td className="px-1 py-2 text-center font-bold text-cyan-300">
                              {position}
                            </td>

                            <td className="px-1 py-2 text-center">
                              {renderMove(move)}
                            </td>

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
                                    tournamentId: typedTournament.id,
                                    categoryId: selectedCategoryId || null,
                                    roundId: selectedRound?.id ?? null,
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
                              {formatThru(row.details, selectedRound?.id ?? null)}
                            </td>

                            <td className="px-1 py-2 text-center font-semibold text-slate-200">
                              {formatRelativeOrDQ(
                                row.selected_round_to_par,
                                row.is_disqualified
                              )}
                            </td>

                            <td className="px-1 py-2 text-center font-bold text-white">
                              {formatRelativeOrDQ(row.total_to_par, row.is_disqualified)}
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
                                  <DetailTable row={row} />
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
          )}
        </div>
      </section>

      <section className="bg-[#08111f]">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Live Scoring
              </p>
              <p className="mt-3 text-lg font-bold text-white">
                Seguimiento en vivo
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Captura visible públicamente sin entrar al sistema administrativo.
              </p>
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Leaderboard
              </p>
              <p className="mt-3 text-lg font-bold text-white">
                Resultados oficiales
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Consulta posiciones, acumulados y detalle por ronda del torneo.
              </p>
            </div>

            <div className="rounded-[28px] border border-emerald-400/20 bg-emerald-500/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-200">
                Firma electrónica
              </p>
              <p className="mt-3 text-lg font-bold text-white">
                Acceso directo a firmas
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-200">
                Ingresa a la captura y validación de firma del jugador y marker.
              </p>

              <div className="mt-4">
                <Link
                  href={buildScorecardsHref({
                    tournamentId: typedTournament.id,
                    roundId: selectedRound?.id ?? null,
                  })}
                  className="inline-flex min-h-9 items-center justify-center rounded-md border border-emerald-400 bg-gradient-to-b from-emerald-500 to-emerald-700 px-4 text-sm font-bold text-white shadow-[0_3px_0_#065f46,0_4px_8px_rgba(0,0,0,0.25)] transition hover:from-emerald-400 hover:to-emerald-600"
                >
                  Ir a firma electrónica
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}