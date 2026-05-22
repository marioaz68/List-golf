import type { MatchPlaySeedingMethod } from "./types";
import type { MatchPlayTeamRow } from "./teamTypes";

export type TeamForSeed = {
  id: string;
  seed: number | null;
  combined_hi: number | null;
  auction_bid: number | null;
  auction_order: number | null;
  team_name: string | null;
};

export function sortTeamsForSeeding(
  teams: MatchPlayTeamRow[],
  method: MatchPlaySeedingMethod
): TeamForSeed[] {
  const mapped: TeamForSeed[] = teams.map((t) => ({
    id: t.id,
    seed: t.seed,
    combined_hi: t.combined_hi,
    auction_bid: t.auction_bid ?? null,
    auction_order: t.auction_order ?? null,
    team_name: t.team_name,
  }));

  switch (method) {
    case "auction":
      return [...mapped].sort((a, b) => {
        // 1) mayor postura → mejor seed
        const bidA = a.auction_bid ?? -Infinity;
        const bidB = b.auction_bid ?? -Infinity;
        if (bidB !== bidA) return bidB - bidA;
        // 2) en empate, salió antes a la subasta → mejor seed
        const ordA = a.auction_order ?? Number.POSITIVE_INFINITY;
        const ordB = b.auction_order ?? Number.POSITIVE_INFINITY;
        if (ordA !== ordB) return ordA - ordB;
        // 3) último: seed previo guardado
        const seedA = a.seed ?? 9999;
        const seedB = b.seed ?? 9999;
        return seedA - seedB;
      });
    case "hi_combined":
      return [...mapped].sort((a, b) => {
        const seedA = a.seed ?? 9999;
        const seedB = b.seed ?? 9999;
        if (seedA !== seedB) return seedA - seedB;
        const hiA = a.combined_hi ?? 99;
        const hiB = b.combined_hi ?? 99;
        return hiA - hiB;
      });
    case "random":
      return [...mapped].sort(() => Math.random() - 0.5);
    case "manual":
    default:
      return [...mapped].sort((a, b) => {
        const seedA = a.seed ?? 9999;
        const seedB = b.seed ?? 9999;
        if (seedA !== seedB) return seedA - seedB;
        return (a.team_name ?? "").localeCompare(b.team_name ?? "");
      });
  }
}

/** Asigna seeds 1..n si faltan (tras ordenar). */
export function assignSeedNumbers(ordered: TeamForSeed[]): TeamForSeed[] {
  return ordered.map((t, i) => ({
    ...t,
    seed: t.seed ?? i + 1,
  }));
}
