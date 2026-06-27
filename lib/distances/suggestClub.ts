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
  yardsToGreen: number
): boolean {
  return isShortGameDistance(yardsToGreen);
}

// pickLwThreeQuarterPlan removed — selection logic now handled in pickBestClubAndCarry

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

  // If the ball is close (< SHORT_GAME_LW_MAX_YARDS), prefer LW and use
  // the exact distance to center as planned carry.
  if (!onGreenLie && targetYards > 0 && targetYards <= SHORT_GAME_LW_MAX_YARDS) {
    const lw = clubs.find((c) => c.catalogId === "lw" && c.enabled);
    if (lw) {
      const cat = CLUB_BY_ID.lw;
      const swing: SwingKind = lw.yardsThreeQuarter > 0 ? "three_quarter" : "full";
      return {
        catalogId: "lw",
        swing,
        carryYards: yardsToGreenCenterRounded(targetYards),
        shortLabel: cat.shortLabel,
        rollerLabel: `${cat.shortLabel}`,
      };
    }
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

  // Build candidate list (both full and 3/4 where available).
  const candidates: Array<{
    catalogId: string;
    swing: SwingKind;
    carry: number;
    shortLabel: string;
  }> = [];

  for (const c of clubs) {
    const cat = CLUB_BY_ID[c.catalogId];
    if (!cat || cat.category === "putter") continue;
    for (const swing of ["full", "three_quarter"] as SwingKind[]) {
      const carry = carryYards(c.yardsFull, c.yardsThreeQuarter, swing);
      if (carry <= 0) continue;
      candidates.push({ catalogId: c.catalogId, swing, carry, shortLabel: cat.shortLabel });
    }
  }

  if (!candidates.length) return null;

  // 1) Exact carry match: prefer full over three_quarter when tie.
  const exact = candidates.filter((x) => x.carry === targetYards);
  if (exact.length > 0) {
    exact.sort((a, b) => {
      if (a.carry !== b.carry) return b.carry - a.carry;
      if (a.swing === b.swing) return 0;
      return a.swing === "full" ? -1 : 1;
    });
    const pick = exact[0];
    return {
      catalogId: pick.catalogId,
      swing: pick.swing,
      carryYards: pick.carry,
      shortLabel: pick.shortLabel,
      rollerLabel: pick.swing === "three_quarter" ? `${pick.shortLabel} 3/4` : `${pick.shortLabel} full`,
    };
  }

  // 2) Find the smallest carry that is >= target (next-up).
  const higher = candidates.filter((x) => x.carry >= targetYards).sort((a, b) => {
    if (a.carry !== b.carry) return a.carry - b.carry; // prefer smaller carry above target
    if (a.swing === b.swing) return 0;
    return a.swing === "full" ? -1 : 1; // prefer full
  });
  if (higher.length > 0) {
    const pick = higher[0];
    return {
      catalogId: pick.catalogId,
      swing: pick.swing,
      carryYards: pick.carry,
      shortLabel: pick.shortLabel,
      rollerLabel: pick.swing === "three_quarter" ? `${pick.shortLabel} 3/4` : `${pick.shortLabel} full`,
    };
  }

  // 3) Fallback: nearest by absolute difference; tie-breaker prefers larger carry and full.
  candidates.sort((a, b) => {
    const da = Math.abs(a.carry - targetYards);
    const db = Math.abs(b.carry - targetYards);
    if (da !== db) return da - db;
    if (a.carry !== b.carry) return b.carry - a.carry; // prefer larger carry
    if (a.swing === b.swing) return 0;
    return a.swing === "full" ? -1 : 1;
  });
  const best = candidates[0];
  return {
    catalogId: best.catalogId,
    swing: best.swing,
    carryYards: best.carry,
    shortLabel: best.shortLabel,
    rollerLabel: best.swing === "three_quarter" ? `${best.shortLabel} 3/4` : `${best.shortLabel} full`,
  };
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
      .map((x) => ({
        catalogId: x.catalogId,
        label: x.label,
        shortLabel: x.shortLabel,
        carryYards: x.carryYards,
        targetYards: x.targetYards,
        gapYards: x.gapYards,
      }));
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
  return candidates.map((x) => ({
    catalogId: x.catalogId,
    label: x.label,
    shortLabel: x.shortLabel,
    carryYards: x.carryYards,
    targetYards: x.targetYards,
    gapYards: x.gapYards,
  }));
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
