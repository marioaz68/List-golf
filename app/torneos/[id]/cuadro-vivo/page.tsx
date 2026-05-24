import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import type { TournamentSettings } from "@/types/tournament";
import type {
  MatchPlayConvocatoriaConfig,
  MatchPlayPrizeShare,
} from "@/lib/matchplay/types";
import LiveBracketView from "./LiveBracketView";

export const dynamic = "force-dynamic";

type RouteParams = { id: string };

export default async function PublicLiveBracketPage(props: {
  params: Promise<RouteParams> | RouteParams;
}) {
  const params = await Promise.resolve(props.params);
  const tournamentId = params.id;
  if (!tournamentId) notFound();

  const supabase = createAdminClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, settings, is_public, is_archived")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) notFound();
  if (tournament.is_public === false) notFound();

  const settings = (tournament.settings ?? {}) as TournamentSettings;
  const isMatchPlay = isMatchPlayFormat(settings);

  if (!isMatchPlay) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4 text-white">
        <h1 className="text-xl font-bold">Cuadro en vivo</h1>
        <p className="text-sm text-amber-200">
          Este torneo no es match play.
        </p>
        <Link
          href={`/torneos/${tournamentId}`}
          className="inline-flex items-center rounded border border-white/15 bg-white/5 px-3 py-1.5 text-sm"
        >
          ← Volver
        </Link>
      </main>
    );
  }

  const teamsData = await loadMatchPlayTeamsData(tournamentId);

  if (teamsData.migrationMissing) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4 text-white">
        <h1 className="text-xl font-bold">Cuadro en vivo</h1>
        <div className="rounded border border-amber-400/40 bg-amber-950/40 p-3 text-sm text-amber-100">
          Faltan migraciones de match play. Pide al administrador aplicarlas.
        </div>
      </main>
    );
  }

  const { data: rulesRow } = await supabase
    .from("tournament_matchplay_rules")
    .select(
      "bracket_main_pairs, max_pairs_per_category, auction_pot_percent, auction_currency, config_json"
    )
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const cfg = (rulesRow?.config_json ?? {}) as Partial<MatchPlayConvocatoriaConfig>;
  const prizeShares: MatchPlayPrizeShare[] = Array.isArray(cfg.prize_shares)
    ? (cfg.prize_shares as MatchPlayPrizeShare[])
    : [];
  const currency =
    (cfg.auction?.currency ?? rulesRow?.auction_currency ?? "MXN") as string;
  const potPercent =
    rulesRow?.auction_pot_percent != null
      ? Number(rulesRow.auction_pot_percent)
      : null;
  const bracketMainPairs =
    rulesRow?.bracket_main_pairs ?? rulesRow?.max_pairs_per_category ?? null;

  // Si ya existe bracket publicado, traemos matches reales para overlay
  const { data: bracket } = await supabase
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let existingMatches: Array<{
    id: string;
    round_no: number;
    position_no: number;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: string | null;
    result_text: string | null;
  }> = [];

  if (bracket?.id) {
    const { data: matchesRaw } = await supabase
      .from("matchplay_matches")
      .select(
        "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
      )
      .eq("bracket_id", bracket.id);
    existingMatches = matchesRaw ?? [];
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] p-3 text-white sm:p-5">
      <LiveBracketView
        tournamentId={tournamentId}
        tournamentName={tournament.name ?? "Torneo"}
        teams={teamsData.teams}
        existingMatches={existingMatches}
        bracketMainPairs={bracketMainPairs}
        currency={currency}
        potPercent={potPercent}
        prizeShares={prizeShares}
      />
    </main>
  );
}
