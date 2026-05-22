import type {
  MatchPlayHandicapAllowance,
  MatchPlayMatchType,
  MatchPlayPairFormat,
} from "./types";

/**
 * Tabla de allowances recomendados por la USGA / WHS
 * Rules of Handicapping — Section 6.1, Table of Recommended Handicap Allowances.
 * https://www.usga.org/handicapping/roh/Content/rules/Appendix%20C%20Handicap%20Allowance.htm
 */
export type UsgaAllowanceRow = {
  format_key: string;
  format_label: string;
  match_play_pct: number | null;
  stroke_play_pct: number | null;
  /** Cómo se aplica entre equipos al match (en match play). */
  application:
    | "1v1_full_difference"
    | "fourball_each_vs_corresponding"
    | "combined_50pct"
    | "best_low_pct"
    | "scramble_weighted";
  notes: string;
  allowance_value: MatchPlayHandicapAllowance;
  custom_pct: number | null;
};

export const USGA_ALLOWANCES: UsgaAllowanceRow[] = [
  {
    format_key: "individual",
    format_label: "Individual (1 vs 1)",
    match_play_pct: 100,
    stroke_play_pct: 95,
    application: "1v1_full_difference",
    notes:
      "Match play: 100%. Stroke play: 95%. Se aplica la diferencia entera entre Course Handicaps a los hoyos de mayor stroke index.",
    allowance_value: "full_relative",
    custom_pct: 100,
  },
  {
    format_key: "fourball",
    format_label: "Four-Ball / Mejor bola",
    match_play_pct: 90,
    stroke_play_pct: 85,
    application: "fourball_each_vs_corresponding",
    notes:
      "USGA: 90% match play, 85% stroke play. Cada jugador juega su bola; el menor HI del match juega scratch y el resto recibe la diferencia.",
    allowance_value: "fourball_85",
    custom_pct: 90,
  },
  {
    format_key: "low_high",
    format_label: "Bola Baja + Bola Alta (2 pts/hoyo)",
    match_play_pct: 90,
    stroke_play_pct: 80,
    application: "fourball_each_vs_corresponding",
    notes:
      "Cada hoyo otorga 2 puntos: 1 a la bola baja neta y 1 a la bola alta neta del equipo. El % de hándicap es ajustable (USGA recomienda 90% match play / 80% stroke; clubes mexicanos usan 80%).",
    allowance_value: "custom",
    custom_pct: 80,
  },
  {
    format_key: "foursomes",
    format_label: "Foursomes (golpe alterno)",
    match_play_pct: 50,
    stroke_play_pct: 50,
    application: "combined_50pct",
    notes:
      "USGA: 50% del HI combinado de la pareja. Se compara contra el 50% combinado de la pareja rival.",
    allowance_value: "foursomes_50_combined",
    custom_pct: 50,
  },
  {
    format_key: "greensome",
    format_label: "Greensome / Pinehurst",
    match_play_pct: 60,
    stroke_play_pct: 60,
    application: "best_low_pct",
    notes:
      "USGA: 60% del jugador de menor HI + 40% del de mayor HI = HI del equipo.",
    allowance_value: "custom",
    custom_pct: 60,
  },
  {
    format_key: "chapman",
    format_label: "Chapman / Pinehurst (combinado)",
    match_play_pct: 60,
    stroke_play_pct: 60,
    application: "best_low_pct",
    notes:
      "USGA: 60% del menor HI + 40% del mayor HI. Igual a greensome.",
    allowance_value: "custom",
    custom_pct: 60,
  },
  {
    format_key: "scramble_2",
    format_label: "Scramble 2 personas",
    match_play_pct: 35,
    stroke_play_pct: 35,
    application: "scramble_weighted",
    notes:
      "USGA: 35% del menor HI + 15% del mayor HI = HI del equipo.",
    allowance_value: "custom",
    custom_pct: 35,
  },
];

const FORMAT_TO_USGA_KEY: Record<
  MatchPlayPairFormat,
  UsgaAllowanceRow["format_key"]
> = {
  fourball: "fourball",
  low_high: "low_high",
  foursomes: "foursomes",
  greensome: "greensome",
  chapman: "chapman",
  scramble: "scramble_2",
};

export function usgaAllowanceForFormat(
  match_type: MatchPlayMatchType,
  pair_format: MatchPlayPairFormat
): UsgaAllowanceRow {
  if (match_type === "individual") {
    return USGA_ALLOWANCES[0];
  }
  const key = FORMAT_TO_USGA_KEY[pair_format];
  return USGA_ALLOWANCES.find((r) => r.format_key === key) ?? USGA_ALLOWANCES[0];
}

/** Aplica allowance % al HI base, con redondeo USGA (>=0.5 sube). */
export function applyUsgaAllowance(hi: number, pct: number): number {
  const raw = (hi * pct) / 100;
  const floored = Math.floor(raw);
  const decimal = raw - floored;
  if (decimal >= 0.5) return floored + 1;
  return floored;
}

/** Course Handicap combinado de pareja según formato USGA. */
export function combinedTeamHandicap(params: {
  pair_format: MatchPlayPairFormat | null;
  match_type: MatchPlayMatchType;
  hi_a: number;
  hi_b: number | null;
  allowance_pct: number;
}): number {
  const { pair_format, match_type, hi_a, hi_b, allowance_pct } = params;

  if (match_type === "individual" || hi_b === null) {
    return applyUsgaAllowance(hi_a, allowance_pct);
  }

  switch (pair_format) {
    case "foursomes": {
      const sum = hi_a + hi_b;
      return applyUsgaAllowance(sum, allowance_pct);
    }
    case "greensome":
    case "chapman": {
      const low = Math.min(hi_a, hi_b);
      const high = Math.max(hi_a, hi_b);
      return applyUsgaAllowance(low, 60) + applyUsgaAllowance(high, 40);
    }
    case "scramble": {
      const low = Math.min(hi_a, hi_b);
      const high = Math.max(hi_a, hi_b);
      return applyUsgaAllowance(low, 35) + applyUsgaAllowance(high, 15);
    }
    case "fourball":
    case "low_high":
    default: {
      const sumApplied =
        applyUsgaAllowance(hi_a, allowance_pct) +
        applyUsgaAllowance(hi_b, allowance_pct);
      return Math.round((sumApplied / 2) * 10) / 10;
    }
  }
}
