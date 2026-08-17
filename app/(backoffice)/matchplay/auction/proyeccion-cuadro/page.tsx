import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import type { TournamentSettings } from "@/types/tournament";
import type { MatchPlayConvocatoriaConfig } from "@/lib/matchplay/types";
import AuctionBracketTvClient from "./AuctionBracketTvClient";

export const dynamic = "force-dynamic";

type SP = { tournament_id?: string };

export default async function AuctionBracketTvPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  if (!tournamentId) {
    redirect("/matchplay/auction/raffle");
  }

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, name, settings")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) {
    redirect("/matchplay");
  }

  if (!isMatchPlayFormat((tournament.settings ?? {}) as TournamentSettings)) {
    redirect(`/matchplay?tournament_id=${tournamentId}`);
  }

  const teamsData = await loadMatchPlayTeamsData(tournamentId);

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select(
      "bracket_main_pairs, max_pairs_per_category, auction_pot_percent, auction_currency, config_json"
    )
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const cfg = (rulesRow?.config_json ??
    {}) as Partial<MatchPlayConvocatoriaConfig>;
  const currency =
    (cfg.auction?.currency ?? rulesRow?.auction_currency ?? "MXN") as string;
  const potPercent =
    rulesRow?.auction_pot_percent != null
      ? Number(rulesRow.auction_pot_percent)
      : null;
  const bracketMainPairs =
    rulesRow?.bracket_main_pairs ?? rulesRow?.max_pairs_per_category ?? null;

  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .neq("name", "Consolación Match Play")
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
    const { data: matchesRaw } = await admin
      .from("matchplay_matches")
      .select(
        "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, result_text"
      )
      .eq("bracket_id", bracket.id);
    existingMatches = matchesRaw ?? [];
  }

  return (
    <AuctionBracketTvClient
      tournamentId={tournamentId}
      tournamentName={String(tournament.name ?? "Subasta")}
      teams={teamsData.teams}
      existingMatches={existingMatches}
      bracketMainPairs={bracketMainPairs}
      currency={currency}
      potPercent={potPercent}
    />
  );
}
