/** Catálogo fijo de bastones + yardas full/3·4 por defecto (promedio amateur). */
export type ClubCategory =
  | "wood"
  | "hybrid"
  | "iron"
  | "wedge"
  | "putter";

export type SwingKind = "full" | "three_quarter";

export interface ClubCatalogEntry {
  id: string;
  label: string;
  shortLabel: string;
  category: ClubCategory;
  /** Yardas full swing por defecto; 0 = no aplica (putter). */
  defaultYardsFull: number;
  sortOrder: number;
}

/** Todos los bastones posibles; el jugador activa solo los de su bolsa. */
export const CLUB_CATALOG: ClubCatalogEntry[] = [
  { id: "driver", label: "Driver", shortLabel: "D", category: "wood", defaultYardsFull: 230, sortOrder: 10 },
  { id: "3w", label: "Madera 3", shortLabel: "3W", category: "wood", defaultYardsFull: 210, sortOrder: 20 },
  { id: "5w", label: "Madera 5", shortLabel: "5W", category: "wood", defaultYardsFull: 195, sortOrder: 30 },
  { id: "7w", label: "Madera 7", shortLabel: "7W", category: "wood", defaultYardsFull: 180, sortOrder: 40 },
  { id: "9w", label: "Madera 9", shortLabel: "9W", category: "wood", defaultYardsFull: 170, sortOrder: 50 },
  { id: "2h", label: "Híbrido 2", shortLabel: "2H", category: "hybrid", defaultYardsFull: 200, sortOrder: 60 },
  { id: "3h", label: "Híbrido 3", shortLabel: "3H", category: "hybrid", defaultYardsFull: 190, sortOrder: 70 },
  { id: "4h", label: "Híbrido 4", shortLabel: "4H", category: "hybrid", defaultYardsFull: 180, sortOrder: 80 },
  { id: "5h", label: "Híbrido 5", shortLabel: "5H", category: "hybrid", defaultYardsFull: 170, sortOrder: 90 },
  { id: "6h", label: "Híbrido 6", shortLabel: "6H", category: "hybrid", defaultYardsFull: 160, sortOrder: 100 },
  { id: "3i", label: "Hierro 3", shortLabel: "3i", category: "iron", defaultYardsFull: 185, sortOrder: 110 },
  { id: "4i", label: "Hierro 4", shortLabel: "4i", category: "iron", defaultYardsFull: 175, sortOrder: 120 },
  { id: "5i", label: "Hierro 5", shortLabel: "5i", category: "iron", defaultYardsFull: 165, sortOrder: 130 },
  { id: "6i", label: "Hierro 6", shortLabel: "6i", category: "iron", defaultYardsFull: 155, sortOrder: 140 },
  { id: "7i", label: "Hierro 7", shortLabel: "7i", category: "iron", defaultYardsFull: 145, sortOrder: 150 },
  { id: "8i", label: "Hierro 8", shortLabel: "8i", category: "iron", defaultYardsFull: 135, sortOrder: 160 },
  { id: "9i", label: "Hierro 9", shortLabel: "9i", category: "iron", defaultYardsFull: 125, sortOrder: 170 },
  { id: "pw", label: "Pitching wedge (PW)", shortLabel: "PW", category: "wedge", defaultYardsFull: 115, sortOrder: 180 },
  { id: "w48", label: "Cuña 48°", shortLabel: "48°", category: "wedge", defaultYardsFull: 110, sortOrder: 190 },
  { id: "w50", label: "Cuña 50°", shortLabel: "50°", category: "wedge", defaultYardsFull: 105, sortOrder: 200 },
  { id: "w52", label: "Cuña 52°", shortLabel: "52°", category: "wedge", defaultYardsFull: 100, sortOrder: 210 },
  { id: "w54", label: "Cuña 54°", shortLabel: "54°", category: "wedge", defaultYardsFull: 95, sortOrder: 220 },
  { id: "sw", label: "Sand wedge (SW · 56°)", shortLabel: "SW", category: "wedge", defaultYardsFull: 85, sortOrder: 230 },
  { id: "w58", label: "Cuña 58°", shortLabel: "58°", category: "wedge", defaultYardsFull: 75, sortOrder: 240 },
  { id: "lw", label: "Lob wedge (LW · 60°)", shortLabel: "LW", category: "wedge", defaultYardsFull: 65, sortOrder: 250 },
  { id: "putter", label: "Putter", shortLabel: "P", category: "putter", defaultYardsFull: 0, sortOrder: 260 },
];

export const CLUB_BY_ID = Object.fromEntries(
  CLUB_CATALOG.map((c) => [c.id, c])
) as Record<string, ClubCatalogEntry>;

/** 3/4 ≈ 75 % de la yarda full (redondeada a 5 yds). */
export function defaultThreeQuarterYards(full: number): number {
  if (full <= 0) return 0;
  return Math.round((full * 0.75) / 5) * 5;
}

/** Rango de yardas para roller, paso 5 (p. ej. bolsa o distancia al green). */
export function yardRangeValues(
  min: number,
  max: number,
  step = 5
): number[] {
  const lo = Math.round(min / step) * step;
  const hi = Math.round(max / step) * step;
  const out: number[] = [];
  for (let y = lo; y <= hi; y += step) out.push(y);
  return out;
}

/** Valores ±50 yds alrededor del bastón, en saltos de 5. */
export function clubYardPickerValues(anchorYards: number): number[] {
  const center = Math.max(5, Math.round(anchorYards / 5) * 5);
  return yardRangeValues(
    Math.max(10, center - 50),
    Math.min(320, center + 50),
    5
  );
}

export function carryYards(
  yardsFull: number,
  yardsThreeQuarter: number,
  swing: SwingKind
): number {
  return swing === "full" ? yardsFull : yardsThreeQuarter;
}
