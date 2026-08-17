import type { MatchPlayTeamRow } from "@/lib/matchplay/teamTypes";

/** Parejas ya sorteadas (tienen número de turno), con o sin postura. */
export function drawnAuctionTeams(teams: MatchPlayTeamRow[]): MatchPlayTeamRow[] {
  return teams
    .filter(
      (t) =>
        t.is_active &&
        t.auction_order != null &&
        t.auction_order !== undefined
    )
    .sort((a, b) => (a.auction_order ?? 0) - (b.auction_order ?? 0));
}

/** Parejas con turno y postura (subasta cerrada). */
export function awardedAuctionTeams(
  teams: MatchPlayTeamRow[]
): MatchPlayTeamRow[] {
  return drawnAuctionTeams(teams).filter((t) => t.auction_bid != null);
}

/**
 * Turnos sorteados aún sin adjudicar.
 * El actual es el de número más bajo: no se rifa el 5 si el 4 sigue abierto.
 */
export function openUnbidAuctionTeams(
  teams: MatchPlayTeamRow[]
): MatchPlayTeamRow[] {
  return drawnAuctionTeams(teams).filter((t) => t.auction_bid == null);
}

export function currentOpenAuctionTeam(
  teams: MatchPlayTeamRow[]
): MatchPlayTeamRow | null {
  return openUnbidAuctionTeams(teams)[0] ?? null;
}

export function nextAuctionTurnNumber(teams: MatchPlayTeamRow[]): number {
  const open = currentOpenAuctionTeam(teams);
  if (open?.auction_order != null) return open.auction_order;
  const drawn = drawnAuctionTeams(teams);
  const max = drawn.reduce((m, t) => Math.max(m, t.auction_order ?? 0), 0);
  return max + 1;
}
