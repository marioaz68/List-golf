import { assignTeeSet, type Player, type Rule } from "@/lib/tee-assignment";
import { effectiveEntryHi } from "@/lib/matchplay/entryHi";
import {
  computeWhsHandicap,
  pickTeeForGender,
  type WhsComputeResult,
  type WhsTeeData,
} from "@/lib/handicap/whs";

export type CourseTeeForHandicap = {
  code: string | null;
  slope_men: number | null;
  slope_women: number | null;
  course_rating_men: number | null;
  course_rating_women: number | null;
  par: number | null;
};

export type TournamentTeeSetLite = {
  id: string;
  code: string | null;
};

export type TournamentHandicapContext = {
  tournamentTeeSets: TournamentTeeSetLite[];
  categoryTeeRules: Rule[];
  /** category_id → % de reglas de competencia (ej. 80). */
  allowancePctByCategory: Map<string, number>;
  courseTeesByCode: Map<string, CourseTeeForHandicap>;
  /** Fallback match play: salida M/F global del torneo. */
  matchplayFallback?: {
    allowance_pct: number;
    men: Partial<WhsTeeData> | null;
    women: Partial<WhsTeeData> | null;
  };
};

export type EntryForHandicap = {
  id: string;
  player_id: string;
  category_id: string | null;
  handicap_index?: number | null;
  playing_handicap_override?: number | null;
  player?: {
    gender?: string | null;
    birth_year?: number | null;
    handicap_index?: number | null;
    handicap_torneo?: number | null;
  } | null;
};

function normalizeTeeCode(code: string | null | undefined): string {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

function whsFromCourseTee(
  courseTee: CourseTeeForHandicap,
  gender: "M" | "F" | "X"
): WhsTeeData | null {
  const men: Partial<WhsTeeData> | null =
    courseTee.slope_men != null && courseTee.course_rating_men != null
      ? {
          slope: Number(courseTee.slope_men),
          course_rating: Number(courseTee.course_rating_men),
          par: Number(courseTee.par ?? 72),
        }
      : null;
  const women: Partial<WhsTeeData> | null =
    courseTee.slope_women != null && courseTee.course_rating_women != null
      ? {
          slope: Number(courseTee.slope_women),
          course_rating: Number(courseTee.course_rating_women),
          par: Number(courseTee.par ?? 72),
        }
      : null;
  return pickTeeForGender({ gender, men, women });
}

function resolveWhsTeeForEntry(
  entry: EntryForHandicap,
  ctx: TournamentHandicapContext
): { tee: WhsTeeData; allowance_pct: number; tee_code: string | null } | null {
  const hi = effectiveEntryHi(entry);
  const gender = (entry.player?.gender ?? "X").toString().toUpperCase() as
    | "M"
    | "F"
    | "X";
  const categoryId = entry.category_id ?? "";

  const allowanceFromRule = categoryId
    ? ctx.allowancePctByCategory.get(categoryId)
    : undefined;
  const allowance_pct =
    allowanceFromRule ??
    ctx.matchplayFallback?.allowance_pct ??
    100;

  if (!categoryId) {
    const tee = pickTeeForGender({
      gender,
      men: ctx.matchplayFallback?.men ?? null,
      women: ctx.matchplayFallback?.women ?? null,
    });
    if (tee) return { tee, allowance_pct, tee_code: null };
    return null;
  }

  const player: Player = {
    id: entry.player_id,
    gender,
    handicap_index: hi,
    birth_year: entry.player?.birth_year ?? null,
    category_id: categoryId,
  };

  const teeSetById = new Map(ctx.tournamentTeeSets.map((t) => [t.id, t]));
  const teeSetsForAssign = ctx.tournamentTeeSets.map((t) => ({
    id: t.id,
    code: t.code ?? "",
    name: t.code ?? "",
  }));

  const assigned = assignTeeSet(player, ctx.categoryTeeRules, teeSetsForAssign);
  if (assigned) {
    const tournamentTee = teeSetById.get(assigned.id);
    const code = normalizeTeeCode(tournamentTee?.code);
    const courseTee = code ? ctx.courseTeesByCode.get(code) : undefined;
    if (courseTee) {
      const tee = whsFromCourseTee(courseTee, gender);
      if (tee) return { tee, allowance_pct, tee_code: code };
    }
  }

  const fbMen = ctx.matchplayFallback?.men ?? null;
  const fbWomen = ctx.matchplayFallback?.women ?? null;
  const tee = pickTeeForGender({ gender, men: fbMen, women: fbWomen });
  if (tee) return { tee, allowance_pct, tee_code: null };

  return null;
}

/**
 * PH del torneo para un inscrito:
 * 1) Categoría asignada (por HI en inscripción).
 * 2) Salida de esa categoría → slope/rating/par del campo (WHS).
 * 3) % de reglas de competencia del torneo sobre el Course Handicap.
 */
export function resolveTournamentEntryHandicap(
  entry: EntryForHandicap,
  ctx: TournamentHandicapContext
): WhsComputeResult | null {
  const override = entry.playing_handicap_override;
  if (override != null && Number.isFinite(Number(override))) {
    const hi = effectiveEntryHi(entry);
    return {
      course_handicap: Number(override),
      playing_handicap: Math.round(Number(override)),
      meta: {
        hi,
        slope: 0,
        course_rating: 0,
        par: 0,
        allowance_pct: 0,
        computed_at: new Date().toISOString(),
        source: "override",
      },
    };
  }

  const resolved = resolveWhsTeeForEntry(entry, ctx);
  if (!resolved) return null;

  const hi = effectiveEntryHi(entry);
  const calc = computeWhsHandicap({
    hi,
    slope: resolved.tee.slope,
    course_rating: resolved.tee.course_rating,
    par: resolved.tee.par,
    allowance_pct: resolved.allowance_pct,
  });

  return {
    ...calc,
    meta: {
      ...calc.meta,
      tee_code: resolved.tee_code,
      category_id: entry.category_id,
      source: "category_tee_whs",
    },
  };
}

/** PH efectivo para netos: usa PH guardado o lo calcula con el contexto del torneo. */
export function effectivePlayingHandicapForEntry(
  entry: EntryForHandicap & {
    playing_handicap?: number | null;
    course_handicap?: number | null;
  },
  ctx: TournamentHandicapContext | null
): number | null {
  if (entry.playing_handicap_override != null) {
    return Math.round(Number(entry.playing_handicap_override));
  }
  if (entry.playing_handicap != null && Number.isFinite(Number(entry.playing_handicap))) {
    return Math.round(Number(entry.playing_handicap));
  }
  if (ctx) {
    const calc = resolveTournamentEntryHandicap(entry, ctx);
    if (calc) return calc.playing_handicap;
  }
  return null;
}
