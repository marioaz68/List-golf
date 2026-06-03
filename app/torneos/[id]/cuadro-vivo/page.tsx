import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { getLocale } from "@/lib/i18n/server";
import { messages } from "@/lib/i18n/messages";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import type { TournamentSettings } from "@/types/tournament";
import type {
  MatchPlayConvocatoriaConfig,
  MatchPlayPrizeShare,
} from "@/lib/matchplay/types";
import AutoRefresh from "@/components/public/AutoRefresh";
import LiveBracketView, { type TeeRuleLite, type TeeSetLite } from "./LiveBracketView";

export const dynamic = "force-dynamic";

type RouteParams = { id: string };

export async function generateMetadata(props: {
  params: Promise<RouteParams> | RouteParams;
}): Promise<Metadata> {
  const params = await Promise.resolve(props.params);
  const tournamentId = params.id;
  const locale = await getLocale();
  const pub = messages[locale].publicTournament;
  const tabTitle = pub.bracketLiveTab;

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
        <h1 className="text-xl font-bold">Bracket en vivo</h1>
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
        <h1 className="text-xl font-bold">Bracket en vivo</h1>
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
  const rawPrizeShares: MatchPlayPrizeShare[] = Array.isArray(cfg.prize_shares)
    ? (cfg.prize_shares as MatchPlayPrizeShare[])
    : [];

  // Fallback: si alguna consolación tiene prize_percent en `consolations[]`
  // pero no aparece en prize_shares, la sintetizamos para que se vea en el
  // reparto público.
  const consolations = Array.isArray(cfg.consolations)
    ? cfg.consolations
    : [];
  const prizeShares: MatchPlayPrizeShare[] = [...rawPrizeShares];
  for (const rule of consolations) {
    if (!rule?.enabled || rule.prize_percent == null) continue;
    const targetSource =
      rule.consolation_format === "stroke_play_aggregate"
        ? "stroke_play_aggregate"
        : "consolation_match_play";
    const alreadyPresent = rawPrizeShares.some(
      (p) => (p.source ?? "match_play") === targetSource
    );
    if (alreadyPresent) continue;
    prizeShares.push({
      position: 1,
      label:
        rule.prize_label ??
        (targetSource === "stroke_play_aggregate"
          ? "Consolación Stroke Play"
          : "Consolación Match Play"),
      percent: rule.prize_percent,
      source: targetSource,
    });
  }
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

  // Reglas + sets de salidas para mostrar marca de tee por jugador.
  // También cargamos birth_year de los jugadores en juego (para regla DORADAS 65+).
  const playerIds = new Set<string>();
  for (const t of teamsData.teams) {
    if (t.player_a?.player_id) playerIds.add(t.player_a.player_id);
    if (t.player_b?.player_id) playerIds.add(t.player_b.player_id);
  }

  let teeSetsRes: { data: any[] | null } = { data: [] };
  let teeRulesRes: { data: any[] | null } = { data: [] };
  let playersRes: { data: Array<{ id: string; birth_year: number | null }> | null } = { data: [] };

  try {
    [teeSetsRes, teeRulesRes, playersRes] = await Promise.all([
      supabase
        .from("tee_sets")
        .select("id, name, code, color")
        .eq("tournament_id", tournamentId),
      supabase
        .from("category_tee_rules")
        .select(
          "id, category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
        )
        .eq("tournament_id", tournamentId)
        .order("priority", { ascending: true }),
      playerIds.size > 0
        ? supabase.from("players").select("id, birth_year").in("id", Array.from(playerIds))
        : Promise.resolve({ data: [] as Array<{ id: string; birth_year: number | null }> }),
    ]) as any;
  } catch (err) {
    console.error("[cuadro-vivo] tee_sets/category_tee_rules:", err);
  }

  const teeSets: TeeSetLite[] = (teeSetsRes.data ?? []).map((t) => ({
    id: t.id,
    name: t.name ?? "",
    code: t.code ?? null,
    color: t.color ?? null,
    tee_color: null,
  }));
  const teeRules: TeeRuleLite[] = (teeRulesRes.data ?? []).map((r) => ({
    id: r.id,
    category_id: r.category_id,
    tee_set_id: r.tee_set_id,
    priority: r.priority ?? 999,
    age_min: r.age_min ?? null,
    age_max: r.age_max ?? null,
    gender: (r.gender ?? null) as "M" | "F" | "X" | null,
    handicap_min: r.handicap_min == null ? null : Number(r.handicap_min),
    handicap_max: r.handicap_max == null ? null : Number(r.handicap_max),
  }));
  const birthYearByPlayerId: Record<string, number | null> = {};
  for (const p of playersRes.data ?? []) {
    birthYearByPlayerId[p.id] = p.birth_year ?? null;
  }

  return (
    <main className="min-h-dvh bg-gradient-to-br from-[#020617] via-[#0b132b] to-[#0a1220] p-3 text-white sm:p-5">
      <AutoRefresh intervalMs={10000} />
      <LiveBracketView
        tournamentId={tournamentId}
        tournamentName={tournament.name ?? "Torneo"}
        teams={teamsData.teams}
        existingMatches={existingMatches}
        bracketMainPairs={bracketMainPairs}
        currency={currency}
        potPercent={potPercent}
        prizeShares={prizeShares}
        teeSets={teeSets}
        teeRules={teeRules}
        birthYearByPlayerId={birthYearByPlayerId}
      />
    </main>
  );
}
