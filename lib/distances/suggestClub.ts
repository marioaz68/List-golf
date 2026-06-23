import {
  carryYards,
  CLUB_BY_ID,
  defaultThreeQuarterYards,
  FINE_YARD_ROLLER_MAX,
  MIN_YARD_PICK,
  SHORT_GAME_LW_MAX_YARDS,
  shouldSuggestPutter,
  yardRangeValues,
  type SwingKind,
} from "@/lib/distances/clubCatalog";
import type { LieKind } from "@/lib/distances/detectLie";
import { puttYardsFromCenter } from "@/lib/distances/holeComplete";
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
  return Math.abs(carry - targetYards);
}

/** Carry del LW 3/4 en la bolsa del jugador (o catálogo si no tiene LW). */
export function lwThreeQuarterCarryYards(clubs: PlayerBagClub[]): number {
  const lw = clubs.find((c) => c.catalogId === "lw");
  if (lw) {
    const carry = carryYards(lw.yardsFull, lw.yardsThreeQuarter, "three_quarter");
    if (carry > 0) return carry;
  }
  const cat = CLUB_BY_ID.lw;
  if (!cat) return 0;
  return defaultThreeQuarterYards(cat.defaultYardsFull);
}

/** Distancia corta (≤60 yd al centro): LW 3/4 y yardas exactas al green. */
export function isShortGameDistance(yardsToGreen: number): boolean {
  return yardsToGreen > 0 && yardsToGreen <= SHORT_GAME_LW_MAX_YARDS;
}

/** @deprecated Usar isShortGameDistance — mantiene compatibilidad con alcance LW en bolsa. */
export function isWithinLwThreeQuarterReach(
  yardsToGreen: number,
  clubs: PlayerBagClub[]
): boolean {
  return isShortGameDistance(yardsToGreen);
}

function pickLwThreeQuarterPlan(clubs: PlayerBagClub[]): ClubPickPlan | null {
  const lw = clubs.find((c) => c.catalogId === "lw" && c.enabled);
  if (!lw) return null;
  const cat = CLUB_BY_ID.lw;
  if (!cat) return null;
  const carry = carryYards(lw.yardsFull, lw.yardsThreeQuarter, "three_quarter");
  if (carry <= 0) return null;
  return {
    catalogId: "lw",
    swing: "three_quarter",
    carryYards: carry,
    shortLabel: cat.shortLabel,
    rollerLabel: `${cat.shortLabel} 3/4`,
  };
}

/** Yardas enteras al centro del green (sin redondear a 5). */
export function yardsToGreenCenterRounded(yardsToGreen: number): number {
  return Math.max(MIN_YARD_PICK, Math.round(yardsToGreen));
}

/**
 * Yardas planeadas por defecto al abrir el panel de golpe.
 * Cerca del hoyo (≤ LW 3/4): distancia al green/hoyo directa.
 */
export function defaultPlannedYardsForShot(
  yardsToGreen: number,
  clubs: PlayerBagClub[],
  pick?: { catalogId: string; carryYards: number } | null,
  onGreen?: boolean
): number {
  if (yardsToGreen <= 0) return MIN_YARD_PICK;
  if (onGreen || pick?.catalogId === "putter") {
    return puttYardsFromCenter(yardsToGreen);
  }
  if (isShortGameDistance(yardsToGreen)) {
    return yardsToGreenCenterRounded(yardsToGreen);
  }
  if (pick && pick.carryYards > 0) return pick.carryYards;
  return Math.max(MIN_YARD_PICK, Math.round(yardsToGreen / 5) * 5);
}

/** LW en trampa (3/4 preferido); si no está en bolsa, la cuña más alta disponible. */
function pickBunkerClub(clubs: PlayerBagClub[]): ClubPickPlan | null {
  const preferOrder = [
    "lw",
    "w58",
    "sw",
    "w54",
    "w52",
    "w50",
    "w48",
    "pw",
  ];
  for (const id of preferOrder) {
    const c = clubs.find((x) => x.catalogId === id);
    if (!c) continue;
    const cat = CLUB_BY_ID[id];
    if (!cat) continue;
    const threeQ = carryYards(c.yardsFull, c.yardsThreeQuarter, "three_quarter");
    if (threeQ > 0) {
      return {
        catalogId: id,
        swing: "three_quarter",
        carryYards: threeQ,
        shortLabel: cat.shortLabel,
        rollerLabel: `${cat.shortLabel} 3/4`,
      };
    }
    const full = carryYards(c.yardsFull, c.yardsThreeQuarter, "full");
    if (full <= 0) continue;
    return {
      catalogId: id,
      swing: "full",
      carryYards: full,
      shortLabel: cat.shortLabel,
      rollerLabel: `${cat.shortLabel} full`,
    };
  }
  return null;
}

export interface ClubPickPlan {
  catalogId: string;
  swing: SwingKind;
  carryYards: number;
  shortLabel: string;
  rollerLabel: string;
}

/**
 * Mejor bastón + swing de la bolsa para la distancia al green.
 * Compara full y 3/4; las yardas devueltas son las grabadas en bolsa.
 */
export function pickBestClubAndCarry(
  clubs: PlayerBagClub[],
  targetYards: number,
  greenDist?: GreenDistances | null,
  onGreen?: boolean,
  inBunker?: boolean,
  lieKind?: LieKind
): ClubPickPlan | null {
  if (targetYards <= 0 || !clubs.length) return null;

  const hasPutter = clubs.some((c) => c.catalogId === "putter");
  const onGreenLie = onGreen === true || lieKind === "green";

  if (hasPutter && onGreenLie) {
    const cat = CLUB_BY_ID.putter;
    return {
      catalogId: "putter",
      swing: "full",
      carryYards: puttYardsFromCenter(targetYards),
      shortLabel: cat.shortLabel,
      rollerLabel: "Putt",
    };
  }

  if (inBunker) {
    const bunkerPick = pickBunkerClub(clubs);
    if (bunkerPick) return bunkerPick;
  }

  if (!onGreenLie && isShortGameDistance(targetYards)) {
    const lwPick = pickLwThreeQuarterPlan(clubs);
    if (lwPick) return lwPick;
  }

  if (
    hasPutter &&
    shouldSuggestPutter(targetYards, greenDist, onGreenLie)
  ) {
    const cat = CLUB_BY_ID.putter;
    return {
      catalogId: "putter",
      swing: "full",
      carryYards: puttYardsFromCenter(targetYards),
      shortLabel: cat.shortLabel,
      rollerLabel: "Putt",
    };
  }

  let best: ClubPickPlan | null = null;
  let bestScore = Infinity;

  for (const c of clubs) {
    const cat = CLUB_BY_ID[c.catalogId];
    if (!cat || cat.category === "putter") continue;

    for (const swing of ["full", "three_quarter"] as SwingKind[]) {
      const carry = carryYards(c.yardsFull, c.yardsThreeQuarter, swing);
      if (carry <= 0) continue;
      const score = scoreCandidate(carry, targetYards);
      if (
        score < bestScore ||
        (score === bestScore &&
          best &&
          (carry > best.carryYards ||
            (carry === best.carryYards &&
              swing === "full" &&
              best.swing === "three_quarter")))
      ) {
        bestScore = score;
        best = {
          catalogId: c.catalogId,
          swing,
          carryYards: carry,
          shortLabel: cat.shortLabel,
          rollerLabel:
            swing === "three_quarter"
              ? `${cat.shortLabel} 3/4`
              : `${cat.shortLabel} full`,
        };
      }
    }
  }

  return best;
}

/**
 * Bastones ordenados por qué tan bien encajan con la distancia al green.
 */
export function rankClubsForTarget(
  clubs: PlayerBagClub[],
  targetYards: number,
  swing: SwingKind,
  greenDist?: GreenDistances | null,
  onGreen?: boolean
): ClubSuggestion[] {
  if (targetYards <= 0) return [];

  const hasPutter = clubs.some((c) => c.catalogId === "putter");
  if (hasPutter && shouldSuggestPutter(targetYards, greenDist, onGreen)) {
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
  greenDist?: GreenDistances | null,
  onGreen?: boolean
): ClubSuggestion | null {
  return rankClubsForTarget(clubs, targetYards, swing, greenDist, onGreen)[0] ?? null;
}

/** Valores del rodillo de yardas según distancia y bastón. */
export function shotPlanYardRollerValues(args: {
  yardsToGreen: number;
  plannedYards: number;
  isPutter: boolean;
  shortGame: boolean;
}): number[] {
  const { yardsToGreen, plannedYards, isPutter, shortGame } = args;
  if (isPutter) {
    const hi = Math.max(FINE_YARD_ROLLER_MAX, puttYardsFromCenter(yardsToGreen) + 8);
    return yardRangeValues(1, hi, 1);
  }
  if (yardsToGreen <= FINE_YARD_ROLLER_MAX || shortGame) {
    const center = yardsToGreenCenterRounded(yardsToGreen);
    const span = yardsToGreen <= FINE_YARD_ROLLER_MAX ? 12 : 20;
    return yardRangeValues(
      Math.max(1, center - span),
      center + span,
      1
    );
  }
  const anchor = Math.max(5, Math.round(plannedYards / 5) * 5);
  return yardRangeValues(
    Math.max(5, anchor - 45),
    Math.min(300, anchor + 45),
    5
  );
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
