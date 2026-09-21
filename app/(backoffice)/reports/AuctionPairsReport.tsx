import { checkTournamentAccess } from "@/lib/auth/requireTournamentAccess";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { entryTournamentPh } from "@/lib/matchplay/auctionTeamPh";
import { formatPlayerName } from "@/lib/matchplay/entryHi";
import type { MatchPlayEntryRow } from "@/lib/matchplay/teamTypes";
import AuctionPairsClient, {
  type AuctionPairRow,
  type AuctionPairPlayer,
} from "./AuctionPairsClient";

function playerCell(
  entry: MatchPlayEntryRow | null,
  fallbackName: string
): AuctionPairPlayer | null {
  if (!entry) {
    const name = fallbackName.trim();
    if (!name || name === "—") return null;
    return {
      entry_id: null,
      name,
      hi: null,
      ph: null,
      is_override: false,
      player_number: null,
    };
  }
  return {
    entry_id: entry.id,
    name: formatPlayerName(entry.player),
    // HI del torneo del inscrito (entry → players.handicap_torneo → players.handicap_index).
    hi: Number.isFinite(entry.effective_hi) ? Number(entry.effective_hi) : null,
    // PH canónico: el MISMO helper que usan la rifa, la proyección y el cuadro.
    ph: entryTournamentPh(entry),
    is_override: entry.playing_handicap_override != null,
    player_number: entry.player_number,
  };
}

export default async function AuctionPairsReport({
  tournamentId,
  tournamentName,
}: {
  tournamentId: string;
  tournamentName?: string;
}) {
  const access = await checkTournamentAccess({ tournamentId });
  if (!access.ok) {
    return (
      <p className="text-[12px] text-amber-200">
        No tienes acceso a los reportes de este torneo.
      </p>
    );
  }

  const data = await loadMatchPlayTeamsData(tournamentId);

  if (data.rules?.match_type !== "pairs") {
    return (
      <p className="rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
        Este torneo no está configurado como match play de parejas, así que no
        hay parejas que subastar. Configúralo en{" "}
        <span className="font-semibold">Match play → Reglas</span>.
      </p>
    );
  }

  const rows: AuctionPairRow[] = data.teams
    .filter((t) => t.is_active)
    .map((t) => {
      const fallback = (t.team_name ?? "").split("/");
      const j1 = playerCell(t.player_a, fallback[0] ?? "");
      const j2 = playerCell(t.player_b, fallback[1] ?? "");

      const ph1 = j1?.ph ?? null;
      const ph2 = j2?.ph ?? null;
      const phSum =
        ph1 == null && ph2 == null ? null : (ph1 ?? 0) + (ph2 ?? 0);

      const hi1 = j1?.hi ?? null;
      const hi2 = j2?.hi ?? null;
      const hiSum =
        hi1 == null && hi2 == null
          ? t.combined_hi != null
            ? Number(t.combined_hi)
            : null
          : Number(((hi1 ?? 0) + (hi2 ?? 0)).toFixed(1));

      const cat = t.player_a ?? t.player_b;

      return {
        team_id: t.id,
        auction_order: t.auction_order,
        seed: t.seed,
        auction_bid:
          t.auction_bid != null && Number.isFinite(Number(t.auction_bid))
            ? Number(t.auction_bid)
            : null,
        category_code: cat?.category_code ?? null,
        category_name: cat?.category_name ?? null,
        j1,
        j2,
        ph_sum: phSum,
        hi_sum: hiSum,
        incomplete: j1 == null || j2 == null || ph1 == null || ph2 == null,
      };
    })
    .sort((a, b) => {
      // Orden de la noche de subasta: por turno rifado; las que aún no salen,
      // por suma de handicap de torneo (misma lectura que la hoja de subasta).
      const ao = a.auction_order;
      const bo = b.auction_order;
      if (ao != null && bo != null && ao !== bo) return ao - bo;
      if (ao != null && bo == null) return -1;
      if (ao == null && bo != null) return 1;

      const as = a.ph_sum;
      const bs = b.ph_sum;
      if (as != null && bs != null && as !== bs) return as - bs;
      if (as != null && bs == null) return -1;
      if (as == null && bs != null) return 1;

      return (a.j1?.name ?? "").localeCompare(b.j1?.name ?? "", "es");
    });

  return (
    <AuctionPairsClient
      rows={rows}
      tournamentName={tournamentName ?? "Torneo"}
      bracketSize={data.rules?.bracket_size ?? null}
    />
  );
}
