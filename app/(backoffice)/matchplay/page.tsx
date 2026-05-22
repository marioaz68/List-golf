import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import type { TournamentSettings } from "@/types/tournament";
import MatchPlayTeamsPanel from "./MatchPlayTeamsPanel";
import MatchPlayBracketPanel from "./MatchPlayBracketPanel";
import MatchPlayAuctionPanel from "./MatchPlayAuctionPanel";
import { loadBracketView } from "@/lib/matchplay/loadBracketView";
import type {
  MatchPlayConvocatoriaConfig,
  MatchPlayPairFormat,
  MatchPlayPrizeShare,
} from "@/lib/matchplay/types";

export const dynamic = "force-dynamic";

type SP = {
  tournament_id?: string;
  team_status?: string;
  team_message?: string;
  bracket_status?: string;
  bracket_message?: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "28px",
  padding: "0 10px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "11px",
  textDecoration: "none",
};

export default async function MatchPlayPage(props: {
  searchParams?: SP | Promise<SP>;
}) {
  const supabase = createAdminClient();
  const sp = props.searchParams ? await props.searchParams : {};
  const tournamentId =
    typeof sp.tournament_id === "string" ? sp.tournament_id.trim() : "";

  const { data: tournaments } = await supabase
    .from("tournaments")
    .select("id, name, settings, created_at")
    .order("created_at", { ascending: false });

  const tournamentList = tournaments ?? [];
  const effectiveId =
    tournamentId || (tournamentList[0]?.id as string | undefined) || "";

  if (!tournamentId && effectiveId) {
    redirect(`/matchplay?tournament_id=${effectiveId}`);
  }

  if (!effectiveId) {
    return (
      <div className="space-y-2 p-2 md:p-3">
        <h1 className="text-lg font-bold text-white">Match play</h1>
        <p className="text-sm text-amber-200">Crea un torneo primero.</p>
        <Link href="/tournaments/new" style={buttonStyle}>
          Nuevo torneo
        </Link>
      </div>
    );
  }

  const tournament = tournamentList.find((t) => t.id === effectiveId);
  const isMatchPlay = isMatchPlayFormat(
    (tournament?.settings ?? {}) as TournamentSettings
  );

  const { data: rulesRow, error: rulesError } = await supabase
    .from("tournament_matchplay_rules")
    .select(
      "match_type, pair_format, bracket_type, bracket_round_count, holes_per_match, pair_composition, combined_hi_min, combined_hi_max, handicap_allowance, handicap_allowance_pct, match_tiebreaker, auction_enabled, auction_pot_percent, auction_min_bid, auction_max_bid, auction_currency, bracket_main_pairs, play_in_enabled, max_pairs_per_category, config_json"
    )
    .eq("tournament_id", effectiveId)
    .maybeSingle();

  const migrationMissing =
    rulesError &&
    /tournament_matchplay_rules|does not exist/i.test(rulesError.message);

  let teamsData = null;
  let bracketView = null;
  let seedingMethod = "hi_combined";

  if (isMatchPlay && !migrationMissing) {
    try {
      teamsData = await loadMatchPlayTeamsData(effectiveId);
      bracketView = await loadBracketView(effectiveId);
      const { data: rulesSeed } = await supabase
        .from("tournament_matchplay_rules")
        .select("seeding_method")
        .eq("tournament_id", effectiveId)
        .maybeSingle();
      seedingMethod = rulesSeed?.seeding_method ?? "hi_combined";
    } catch (err) {
      console.error("[matchplay] load teams:", err);
    }
  }

  const matchType =
    teamsData?.rules?.match_type ??
    (rulesRow?.match_type === "individual" ? "individual" : "pairs");

  const cfg = (rulesRow?.config_json ?? {}) as Partial<MatchPlayConvocatoriaConfig>;
  const pairFormat = (rulesRow?.pair_format ?? "fourball") as MatchPlayPairFormat;
  const prizeShares: MatchPlayPrizeShare[] = Array.isArray(cfg.prize_shares)
    ? (cfg.prize_shares as MatchPlayPrizeShare[])
    : [];
  const playerCoverPercent =
    typeof cfg.auction?.player_cover_percent === "number"
      ? cfg.auction.player_cover_percent
      : null;
  const auctionCurrency =
    (cfg.auction?.currency ?? rulesRow?.auction_currency ?? "MXN") as string;
  const allowancePct =
    rulesRow?.handicap_allowance_pct != null
      ? Number(rulesRow.handicap_allowance_pct)
      : null;

  return (
    <div className="space-y-3 p-2 md:p-3">
      <h1 className="text-lg font-bold text-white">Match play</h1>

      <form method="GET" action="/matchplay" className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-[11px] font-semibold text-slate-300">
            Torneo
          </label>
          <select
            name="tournament_id"
            defaultValue={effectiveId}
            className="mt-1 w-full max-w-md rounded border border-white/15 bg-[#0f172a] px-2 py-1.5 text-sm text-white"
          >
            {tournamentList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name ?? t.id.slice(0, 8)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" style={buttonStyle}>
          Cambiar
        </button>
      </form>

      {!isMatchPlay ? (
        <div className="rounded-lg border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-[12px] text-amber-100">
          Este torneo no está en modo match play. Créalo con formato «Match play» o
          aplica la convocatoria match play.
        </div>
      ) : null}

      {migrationMissing ? (
        <div className="rounded-lg border border-amber-400/50 bg-amber-950/40 px-3 py-2 text-[12px] text-amber-100">
          Aplica en Supabase:{" "}
          <code className="text-cyan-200">20260522120000_matchplay.sql</code> y{" "}
          <code className="text-cyan-200">20260522130000_matchplay_team_entry_unique.sql</code>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Link href={`/convocatoria?tournament_id=${effectiveId}`} style={buttonStyle}>
          Convocatoria
        </Link>
        <Link href={`/entries?tournament_id=${effectiveId}`} style={buttonStyle}>
          Inscripciones
        </Link>
        <Link href={`/categories?tournament_id=${effectiveId}`} style={buttonStyle}>
          Categorías
        </Link>
        {isMatchPlay ? (
          <>
            <Link
              href={`/matchplay/auction?tournament_id=${effectiveId}`}
              style={{
                ...buttonStyle,
                background: "linear-gradient(#0891b2, #0e7490)",
                border: "1px solid #155e75",
              }}
            >
              Hoja de subasta
            </Link>
            <Link
              href={`/matchplay/auction/show?tournament_id=${effectiveId}`}
              style={{
                ...buttonStyle,
                background: "linear-gradient(#f59e0b, #b45309)",
                border: "1px solid #78350f",
              }}
            >
              🎙 Subasta en vivo
            </Link>
          </>
        ) : null}
      </div>

      {rulesRow ? (
        <div className="space-y-2 rounded-lg border border-cyan-500/30 bg-cyan-950/20 px-3 py-2 text-[12px] text-cyan-100">
          <p>
            <strong>Tipo:</strong>{" "}
            {rulesRow.match_type === "individual"
              ? "Match play individual"
              : "Match play por parejas"}
          </p>
          <p>
            <strong>Formato:</strong>{" "}
            {rulesRow.match_type === "individual"
              ? "1 vs 1"
              : rulesRow.pair_format}{" "}
            · {rulesRow.bracket_type} · {rulesRow.bracket_round_count} rondas ·{" "}
            {rulesRow.holes_per_match} hoyos/match
          </p>
          {rulesRow.match_type !== "individual" ? (
            <p>
              <strong>Pareja:</strong> {rulesRow.pair_composition}
              {rulesRow.combined_hi_min !== null &&
              rulesRow.combined_hi_max !== null
                ? ` · HI combinado ${rulesRow.combined_hi_min}–${rulesRow.combined_hi_max}`
                : ""}
            </p>
          ) : null}
          <p>
            <strong>Cuadro:</strong>{" "}
            {rulesRow.bracket_main_pairs ??
              rulesRow.max_pairs_per_category ??
              "?"}{" "}
            {rulesRow.match_type === "individual" ? "jugadores" : "parejas"}
          </p>
        </div>
      ) : isMatchPlay ? (
        <div className="rounded-lg border border-white/10 bg-[#0f172a] px-3 py-2 text-[12px] text-slate-300">
          Cierra la convocatoria y genera parámetros para activar reglas match play.
        </div>
      ) : null}

      {isMatchPlay && teamsData && !teamsData.migrationMissing ? (
        <>
          <MatchPlayTeamsPanel
            tournamentId={effectiveId}
            matchType={matchType}
            rules={teamsData.rules}
            categories={teamsData.categories}
            entries={teamsData.entries}
            teams={teamsData.teams}
            assignedEntryIds={[...teamsData.assignedEntryIds]}
            seedingMethod={seedingMethod}
            flashStatus={sp.team_status}
            flashMessage={sp.team_message}
          />
          {seedingMethod === "auction" || rulesRow?.auction_enabled ? (
            <MatchPlayAuctionPanel
              tournamentId={effectiveId}
              teams={teamsData.teams}
              matchType={matchType}
              pairFormat={pairFormat}
              auctionEnabled={!!rulesRow?.auction_enabled}
              potPercent={
                rulesRow?.auction_pot_percent != null
                  ? Number(rulesRow.auction_pot_percent)
                  : null
              }
              minBid={
                rulesRow?.auction_min_bid != null
                  ? Number(rulesRow.auction_min_bid)
                  : null
              }
              maxBid={
                rulesRow?.auction_max_bid != null
                  ? Number(rulesRow.auction_max_bid)
                  : null
              }
              currency={auctionCurrency}
              playerCoverPercent={playerCoverPercent}
              prizeShares={prizeShares}
              allowancePct={allowancePct}
              flashStatus={sp.bracket_status}
              flashMessage={sp.bracket_message}
            />
          ) : null}
          <MatchPlayBracketPanel
            tournamentId={effectiveId}
            teamCount={teamsData.teams.length}
            rules={teamsData.rules}
            bracket={bracketView}
            seedingMethod={seedingMethod}
            flashStatus={sp.bracket_status ?? sp.team_status}
            flashMessage={sp.bracket_message ?? sp.team_message}
          />
        </>
      ) : null}

      <div className="rounded-lg border border-white/10 bg-[#0f172a] p-3 text-[12px] text-slate-400">
        <p className="font-semibold text-slate-200">Siguiente fase</p>
        <ul className="mt-2 list-inside list-disc space-y-1">
          <li>Captura hoyo a hoyo y cierre automático del match</li>
          <li>Vista pública del bracket en vivo</li>
        </ul>
      </div>
    </div>
  );
}
