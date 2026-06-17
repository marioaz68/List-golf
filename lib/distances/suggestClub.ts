import { carryYards, CLUB_BY_ID, type SwingKind } from "@/lib/distances/clubCatalog";
import type { PlayerBagClub } from "@/lib/distances/playerBag";

export interface ClubSuggestion {
  catalogId: string;
  label: string;
  shortLabel: string;
  carryYards: number;
  targetYards: number;
  gapYards: number;
}

/**
 * Bastón cuya carry se acerca más a la distancia objetivo.
 * Prefiere no quedarse corto (>8 yds) cuando hay empate.
 */
export function suggestClub(
  clubs: PlayerBagClub[],
  targetYards: number,
  swing: SwingKind
): ClubSuggestion | null {
  if (targetYards <= 0) return null;

  const candidates = clubs
    .map((c) => {
      const cat = CLUB_BY_ID[c.catalogId];
      if (!cat || cat.defaultYardsFull <= 0) return null;
      const carry = carryYards(c.yardsFull, c.yardsThreeQuarter, swing);
      if (carry <= 0) return null;
      const gap = carry - targetYards;
      const shortfall = gap < 0 ? -gap : 0;
      const score = Math.abs(gap) + shortfall * 1.5;
      return {
        catalogId: c.catalogId,
        label: cat.label,
        shortLabel: cat.shortLabel,
        carryYards: carry,
        targetYards,
        gapYards: gap,
        score,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x != null);

  if (!candidates.length) return null;

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  return {
    catalogId: best.catalogId,
    label: best.label,
    shortLabel: best.shortLabel,
    carryYards: best.carryYards,
    targetYards: best.targetYards,
    gapYards: best.gapYards,
  };
}

/** Valores para el roller: distancia al green ± rango, paso 1 yd. */
export function yardsRollerValues(
  baseYards: number,
  span = 45
): number[] {
  const lo = Math.max(15, baseYards - span);
  const hi = baseYards + span;
  const out: number[] = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out;
}
