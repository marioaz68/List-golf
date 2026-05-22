import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/utils/supabase/admin";
import { isMatchPlayFormat } from "@/lib/matchplay/tournamentFormat";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import type { TournamentSettings } from "@/types/tournament";
import type {
  MatchPlayConvocatoriaConfig,
  MatchPlayPrizeShare,
} from "@/lib/matchplay/types";
import AuctionLiveSheet from "./AuctionLiveSheet";

export const dynamic = "force-dynamic";

type SP = {
  tournament_id?: string;
  status?: string;
  message?: string;
};

const buttonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "30px",
  padding: "0 12px",
  borderRadius: "6px",
  border: "1px solid #374151",
  background: "linear-gradient(#6b7280, #4b5563)",
  color: "#ffffff",
  fontWeight: 600,
  fontSize: "12px",
  textDecoration: "none",
};

export default async function MatchPlayAuctionPage(props: {
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

  const list = tournaments ?? [];
  const effectiveId =
    tournamentId || (list[0]?.id as string | undefined) || "";

  if (!tournamentId && effectiveId) {
    redirect(`/matchplay/auction?tournament_id=${effectiveId}`);
  }

  if (!effectiveId) {
    return (
      <div className="space-y-2 p-3">
        <h1 className="text-lg font-bold text-white">Hoja de subasta</h1>
        <p className="text-sm text-amber-200">Crea un torneo primero.</p>
        <Link href="/tournaments/new" style={buttonStyle}>
          Nuevo torneo
        </Link>
      </div>
    );
  }

  const tournament = list.find((t) => t.id === effectiveId);
  const isMatchPlay = isMatchPlayFormat(
    (tournament?.settings ?? {}) as TournamentSettings
  );

  if (!isMatchPlay) {
    return (
      <div className="space-y-2 p-3">
        <h1 className="text-lg font-bold text-white">Hoja de subasta</h1>
        <p className="text-sm text-amber-200">
          Este torneo no es match play.
        </p>
        <Link href={`/matchplay?tournament_id=${effectiveId}`} style={buttonStyle}>
          Volver
        </Link>
      </div>
    );
  }

  const { data: rulesRow } = await supabase
    .from("tournament_matchplay_rules")
    .select(
      "auction_enabled, auction_pot_percent, auction_min_bid, auction_max_bid, auction_currency, config_json"
    )
    .eq("tournament_id", effectiveId)
    .maybeSingle();

  const teamsData = await loadMatchPlayTeamsData(effectiveId);

  if (teamsData.migrationMissing) {
    return (
      <div className="space-y-2 p-3">
        <h1 className="text-lg font-bold text-white">Hoja de subasta</h1>
        <div className="rounded border border-amber-400/50 bg-amber-950/40 p-3 text-[12px] text-amber-100">
          Faltan migraciones match play en Supabase. Aplica
          {" "}
          <code className="text-cyan-200">
            20260522120000_matchplay.sql
          </code>
          ,{" "}
          <code className="text-cyan-200">
            20260522140000_matchplay_auction_bid.sql
          </code>{" "}
          y{" "}
          <code className="text-cyan-200">
            20260522150000_matchplay_auction_order.sql
          </code>
          .
        </div>
      </div>
    );
  }

  const cfg = (rulesRow?.config_json ?? {}) as Partial<MatchPlayConvocatoriaConfig>;
  const prizeShares: MatchPlayPrizeShare[] = Array.isArray(cfg.prize_shares)
    ? (cfg.prize_shares as MatchPlayPrizeShare[])
    : [];
  const playerCoverPercent =
    typeof cfg.auction?.player_cover_percent === "number"
      ? cfg.auction.player_cover_percent
      : null;
  const currency =
    (cfg.auction?.currency ?? rulesRow?.auction_currency ?? "MXN") as string;
  const potPercent =
    rulesRow?.auction_pot_percent != null
      ? Number(rulesRow.auction_pot_percent)
      : null;
  const minBid =
    rulesRow?.auction_min_bid != null
      ? Number(rulesRow.auction_min_bid)
      : null;
  const maxBid =
    rulesRow?.auction_max_bid != null
      ? Number(rulesRow.auction_max_bid)
      : null;

  return (
    <div className="space-y-3 p-2 md:p-3 print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div>
          <h1 className="text-xl font-bold text-white">Hoja de subasta</h1>
          <p className="text-[12px] text-slate-400">
            {tournament?.name ?? "Torneo"} · Captura orden de salida y postura
            por equipo.
          </p>
        </div>
        <div className="flex gap-1.5">
          <Link
            href={`/matchplay?tournament_id=${effectiveId}`}
            style={buttonStyle}
          >
            ← Match play
          </Link>
        </div>
      </div>

      <AuctionLiveSheet
        tournamentId={effectiveId}
        teams={teamsData.teams}
        potPercent={potPercent}
        minBid={minBid}
        maxBid={maxBid}
        currency={currency}
        playerCoverPercent={playerCoverPercent}
        prizeShares={prizeShares}
        flashStatus={sp.status}
        flashMessage={sp.message}
      />
    </div>
  );
}
