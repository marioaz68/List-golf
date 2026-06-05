import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import type { TournamentSettings } from "@/types/tournament";
import AutoRefresh from "@/components/public/AutoRefresh";
import StrokeAggregateStandingsView from "./StrokeAggregateStandingsView";

export const dynamic = "force-dynamic";

type RouteParams = { id: string };

export async function generateMetadata(props: {
  params: Promise<RouteParams> | RouteParams;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const admin = createAdminClient();
  const { data: t } = await admin
    .from("tournaments")
    .select("name")
    .eq("id", params.id)
    .maybeSingle();
  return {
    title: `Consolación Stroke · ${t?.name ?? "Torneo"}`,
  };
}

export default async function ConsolacionStrokePage(props: {
  params: Promise<RouteParams> | RouteParams;
}) {
  const params = await Promise.resolve(props.params);
  const tournamentId = params.id;
  if (!tournamentId) notFound();

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from("tournaments")
    .select("id, settings, is_public")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.is_public === false) notFound();
  if (!isMatchPlayFormat((tournament.settings ?? {}) as TournamentSettings)) {
    notFound();
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] p-3 text-white sm:p-5">
      <AutoRefresh intervalMs={15000} />
      <StrokeAggregateStandingsView tournamentId={tournamentId} />
    </main>
  );
}
