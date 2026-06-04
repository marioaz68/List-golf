import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { buildLiveStrokeSnapshot } from "@/lib/matchplay/buildLiveStrokeSnapshot";
import AutoRefresh from "@/components/public/AutoRefresh";
import type { TournamentSettings } from "@/types/tournament";
import MatchesLiveGrid from "./MatchesLiveGrid";

export const dynamic = "force-dynamic";

type RouteParams = { id: string };

export async function generateMetadata(props: {
  params: Promise<RouteParams> | RouteParams;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const tournamentId = params.id;
  const locale = await getLocale();
  const pub = messages[locale].publicTournament;
  const tabTitle = pub.matchesLiveTab;

  if (!tournamentId) {
    return { title: tabTitle };
  }

  const supabase = createAdminClient();
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("name, is_public")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament || tournament.is_public === false) {
    return { title: tabTitle };
  }

  return {
    title: `${tabTitle} · ${tournament.name}`,
    description: pub.pageDescBracket,
  };
}

type SearchParams = { [key: string]: string | string[] | undefined };

export default async function PublicMatchesLivePage(props: {
  params: Promise<RouteParams> | RouteParams;
  searchParams?: Promise<SearchParams> | SearchParams;
}) {
  const params = await Promise.resolve(props.params);
  const sp = props.searchParams
    ? await Promise.resolve(props.searchParams)
    : {};
  const matchParam = sp.match;
  const initialOpenMatchId = String(
    Array.isArray(matchParam) ? matchParam[0] : matchParam ?? ""
  ).trim();
  const tournamentId = params.id;
  if (!tournamentId) notFound();

  const supabase = createAdminClient();

  const { data: tournament } = await supabase
    .from("tournaments")
    .select("id, name, settings, is_public")
    .eq("id", tournamentId)
    .maybeSingle();

  if (!tournament) notFound();
  if (tournament.is_public === false) notFound();

  const settings = (tournament.settings ?? {}) as TournamentSettings;
  if (!isMatchPlayFormat(settings)) {
    return (
      <main className="mx-auto max-w-3xl space-y-3 p-4 text-white">
        <h1 className="text-xl font-bold">Matches en vivo</h1>
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

  const { data: rulesRow } = await supabase
    .from("tournament_matchplay_rules")
    .select("holes_per_match")
    .eq("tournament_id", tournamentId)
    .maybeSingle();
  const holesPerMatch = rulesRow?.holes_per_match === 9 ? 9 : 18;

  const snapshot = await buildLiveStrokeSnapshot(supabase, tournamentId);

  // Salidas (pairing_groups) → tee_time / group_no por cruce de parejas.
  const matchSchedule: Record<
    string,
    { groupNo: number | null; teeTime: string | null; groupId: string }
  > = {};
  try {
    const { data: roundsList } = await supabase
      .from("rounds")
      .select("id, round_no")
      .eq("tournament_id", tournamentId);
    const roundIds = (roundsList ?? []).map((r) => String(r.id));
    if (roundIds.length > 0) {
      const { data: pgs } = await supabase
        .from("pairing_groups")
        .select("id, round_id, group_no, tee_time")
        .in("round_id", roundIds);
      const pgIds = (pgs ?? []).map((p) => String(p.id));
      if (pgIds.length > 0) {
        const { data: members } = await supabase
          .from("pairing_group_members")
          .select("group_id, entry_id")
          .in("group_id", pgIds);
        const { data: pairTeams } = await supabase
          .from("matchplay_pair_teams")
          .select("id, player_a_entry_id, player_b_entry_id")
          .eq("tournament_id", tournamentId)
          .eq("is_active", true);
        const entryToTeam = new Map<string, string>();
        for (const t of pairTeams ?? []) {
          if (t.player_a_entry_id)
            entryToTeam.set(t.player_a_entry_id, String(t.id));
          if (t.player_b_entry_id)
            entryToTeam.set(t.player_b_entry_id, String(t.id));
        }
        const teamsByGroup = new Map<string, string[]>();
        for (const m of members ?? []) {
          const team = entryToTeam.get(m.entry_id);
          if (!team) continue;
          const cur = teamsByGroup.get(m.group_id) ?? [];
          if (!cur.includes(team)) cur.push(team);
          teamsByGroup.set(m.group_id, cur);
        }
        const scheduleByKey = new Map<
          string,
          { groupNo: number | null; teeTime: string | null; groupId: string }
        >();
        for (const p of pgs ?? []) {
          const ids = (teamsByGroup.get(String(p.id)) ?? [])
            .slice()
            .sort()
            .join("|");
          if (!ids) continue;
          const teeTime = p.tee_time
            ? String(p.tee_time).slice(0, 5)
            : null;
          scheduleByKey.set(ids, {
            groupNo: typeof p.group_no === "number" ? p.group_no : null,
            teeTime,
            groupId: String(p.id),
          });
        }
        for (const m of snapshot.matches) {
          const ids = [m.top_pair_id, m.bottom_pair_id]
            .filter((x): x is string => !!x)
            .sort()
            .join("|");
          if (!ids) continue;
          const sched = scheduleByKey.get(ids);
          if (sched) matchSchedule[m.id] = sched;
        }
      }
    }
  } catch {
    // Si falla la carga de salidas, seguimos sin tee times.
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] p-3 text-white sm:p-5">
      <AutoRefresh intervalMs={10000} />
      <MatchesLiveGrid
        tournamentId={tournamentId}
        tournamentName={tournament.name ?? "Torneo"}
        teams={teamsData.teams}
        initialMatches={snapshot.matches}
        initialHoles={snapshot.holes}
        bracketId={snapshot.bracketId}
        bracketSize={snapshot.bracketSize}
        roundCount={snapshot.roundCount}
        holesPerMatch={holesPerMatch}
        derivedFromPairings={snapshot.derivedFromPairings}
        liveFromStrokeScores={snapshot.liveFromStrokeScores}
        matchSchedule={matchSchedule}
        initialOpenMatchId={initialOpenMatchId || null}
      />
    </main>
  );
}
