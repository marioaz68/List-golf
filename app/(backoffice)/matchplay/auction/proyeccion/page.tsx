import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import type { TournamentSettings } from "@/types/tournament";
import SorteoProyeccionClient from "./SorteoProyeccionClient";

export const dynamic = "force-dynamic";

type SP = { tournament_id?: string };

export default async function AuctionProyeccionPage(props: {
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

  return (
    <SorteoProyeccionClient
      tournamentId={tournamentId}
      tournamentName={String(tournament.name ?? "Subasta")}
      teams={teamsData.teams}
    />
  );
}
