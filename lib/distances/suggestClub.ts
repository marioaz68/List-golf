import {
  carryYards,
  CLUB_BY_ID,
  MIN_YARD_PICK,
  shouldSuggestPutter,
  yardRangeValues,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import type { PlayerBagClub } from "@/lib/distances/playerBag";

export interface ClubSuggestion {
  catalogId: string;
  label: string;
  shortLabel: string;
  carryYards: number;
  targetYards: number;
  gapYards: number;
}

export interface GreenDistances {
  front: number;
  center: number;
  back: number;
}

function putterSuggestion(targetYards: number): ClubSuggestion {
  const cat = CLUB_BY_ID.putter;
  return {
    catalogId: "putter",
    label: cat.label,
    shortLabel: cat.shortLabel,
    carryYards: targetYards,
    targetYards,
    gapYards: 0,
  };
}

function scoreCandidate(carry: number, targetYards: number): number {
  const gap = carry - targetYards;
  const shortfall = gap < 0 ? -gap : 0;
  return Math.abs(gap) + shortfall * 1.5;
}

/**
 * Bastones ordenados por qué tan bien encajan con la distancia al green.
 */
export function rankClubsForTarget(
  clubs: PlayerBagClub[],
  targetYards: number,
  swing: SwingKind,
  greenDist?: GreenDistances | null
): ClubSuggestion[] {
  if (targetYards <= 0) return [];

  const hasPutter = clubs.some((c) => c.catalogId === "putter");
  if (hasPutter && shouldSuggestPutter(targetYards, greenDist)) {
    const putter = putterSuggestion(targetYards);
    const others = clubs
      .map((c) => {
        const cat = CLUB_BY_ID[c.catalogId];
        if (!cat || cat.defaultYardsFull <= 0) return null;
        const carry = carryYards(c.yardsFull, c.yardsThreeQuarter, swing);
        if (carry <= 0) return null;
        const gap = carry - targetYards;
        return {
          catalogId: c.catalogId,
          label: cat.label,
          shortLabel: cat.shortLabel,
          carryYards: carry,
          targetYards,
          gapYards: gap,
          score: scoreCandidate(carry, targetYards),
        };
      })
      .filter((x): x is NonNullable<typeof x> => x != null)
      .sort((a, b) => a.score - b.score)
      .map(({ score: _, ...rest }) => rest);
    return [putter, ...others];
  }

  const candidates = clubs
    .map((c) => {
      const cat = CLUB_BY_ID[c.catalogId];
      if (!cat || cat.defaultYardsFull <= 0) return null;
      const carry = carryYards(c.yardsFull, c.yardsThreeQuarter, swing);
      if (carry <= 0) return null;
      const gap = carry - targetYards;
      return {
        catalogId: c.catalogId,
        label: cat.label,
        shortLabel: cat.shortLabel,
        carryYards: carry,
        targetYards,
        gapYards: gap,
        score: scoreCandidate(carry, targetYards),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  candidates.sort((a, b) => a.score - b.score);
  return candidates.map(({ score: _, ...rest }) => rest);
}

/**
 * Bastón cuya carry se acerca más a la distancia objetivo.
 * Prefiere no quedarse corto (>8 yds) cuando hay empate.
 */
export function suggestClub(
  clubs: PlayerBagClub[],
  targetYards: number,
  swing: SwingKind,
  greenDist?: GreenDistances | null
): ClubSuggestion | null {
  return rankClubsForTarget(clubs, targetYards, swing, greenDist)[0] ?? null;
}

/** Valores para el roller: distancia al green ± rango, paso 5 yds. */
export function yardsRollerValues(
  baseYards: number,
  span = 45
): number[] {
  const center = Math.max(MIN_YARD_PICK, Math.round(baseYards / 5) * 5);
  const lo = Math.max(MIN_YARD_PICK, center - span);
  const hi = center + span;
  return yardRangeValues(lo, hi, 5);
}
