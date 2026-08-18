import {
  assignTeeSetWithMeta,
  type Player,
  type Rule,
} from "@/lib/tee-assignment";
import { effectiveEntryHi } from "@/lib/matchplay/entryHi";
import {
  computeWhsHandicap,
  pickTeeForGender,
  type WhsComputeResult,
  type WhsTeeData,
} from "@/lib/handicap/whs";
import { hiToChHpAtPct } from "@/lib/ghin-report/handicapMath";
import { TEE_HI_CUTOFF } from "@/lib/ghin-report/ccqCourse";

export type CourseTeeForHandicap = {
  code: string | null;
  name?: string | null;
  color?: string | null;
  slope_men: number | null;
  slope_women: number | null;
  course_rating_men: number | null;
  course_rating_women: number | null;
  par: number | null;
};

export type TournamentTeeSetLite = {
  id: string;
  code: string | null;
  name?: string | null;
  color?: string | null;
};

export type TournamentHandicapContext = {
  tournamentTeeSets: TournamentTeeSetLite[];
  categoryTeeRules: Rule[];
  /** category_id → % de reglas de competencia (ej. 80). */
  allowancePctByCategory: Map<string, number>;
  /** course_tee_sets indexados por code normalizado. */
  courseTeesByCode: Map<string, CourseTeeForHandicap>;
  /** course_tee_sets indexados por nombre normalizado (sin acentos, sin paréntesis). */
  courseTeesByNameNorm?: Map<string, CourseTeeForHandicap>;
  /** course_tee_sets indexados por color normalizado. */
  courseTeesByColor?: Map<string, CourseTeeForHandicap>;
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
  /** Salida forzada por el comité (prioridad sobre category_tee_rules). */
  tee_set_id_override?: string | null;
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

/** Normaliza el nombre/color para matchear entre `tee_sets` del torneo y `course_tee_sets`. */
export function normalizeTeeName(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9 ]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const TEE_CODE_ALIASES: Record<string, string[]> = {
  AZUL: ["AZUL", "BLU"],
  BLU: ["BLU", "AZUL"],
  BLANC: ["BLANC", "WHT"],
  WHT: ["WHT", "BLANC"],
  DORAD: ["DORAD", "GLD"],
  GLD: ["GLD", "DORAD"],
  NEGRA: ["NEGRA", "NEGRAS", "BLK"],
  BLK: ["BLK", "NEGRA", "NEGRAS"],
};

function colorFromTeeLabel(label: string | null | undefined): string | null {
  const n = normalizeTeeName(label);
  if (!n) return null;
  if (n.includes("azul")) return "#2563eb";
  if (n.includes("blanc") || n === "wht") return "#f8fafc";
  if (n.includes("dorad") || n.includes("oro") || n === "gld") return "#d4af37";
  if (n.includes("negr") || n === "blk") return "#111827";
  if (n.includes("roj")) return "#dc2626";
  return null;
}

function findCourseTee(
  ctx: TournamentHandicapContext,
  tee: TournamentTeeSetLite
): CourseTeeForHandicap | null {
  const code = normalizeTeeCode(tee.code);
  const aliases = code ? TEE_CODE_ALIASES[code] ?? [code] : [];
  for (const alias of aliases) {
    const hit = ctx.courseTeesByCode.get(alias);
    if (hit) return hit;
  }
  const nameNorm = normalizeTeeName(tee.name ?? tee.code ?? null);
  if (nameNorm && ctx.courseTeesByNameNorm) {
    const hit = ctx.courseTeesByNameNorm.get(nameNorm);
    if (hit) return hit;
  }
  const colorNorm = normalizeTeeName(tee.color ?? null);
  if (colorNorm && ctx.courseTeesByColor) {
    const hit = ctx.courseTeesByColor.get(colorNorm);
    if (hit) return hit;
  }
  return null;
}

function teeVisual(
  tournamentTee?: TournamentTeeSetLite | null,
  courseTee?: CourseTeeForHandicap | null
): { tee_code: string | null; tee_name: string | null; tee_color: string | null } {
  const name =
    tournamentTee?.name ??
    courseTee?.name ??
    tournamentTee?.code ??
    courseTee?.code ??
    null;
  const code =
    normalizeTeeCode(tournamentTee?.code) ||
    normalizeTeeCode(courseTee?.code) ||
    name;
  const color =
    (tournamentTee?.color && tournamentTee.color.trim()) ||
    (courseTee?.color && courseTee.color.trim()) ||
    colorFromTeeLabel(name) ||
    colorFromTeeLabel(code);
  return {
    tee_code: code || null,
    tee_name: name,
    tee_color: color,
  };
}

function pickCourseTeeByHi(
  ctx: TournamentHandicapContext,
  hi: number,
  gender: "M" | "F" | "X"
): {
  tee: WhsTeeData;
  tee_code: string | null;
  tee_name: string | null;
  tee_color: string | null;
} | null {
  const prefer =
    Number.isFinite(hi) && hi <= TEE_HI_CUTOFF
      ? ["azules", "azul"]
      : ["blancas", "blanc"];
  const names = ctx.courseTeesByNameNorm;
  if (!names) return null;
  for (const key of prefer) {
    const row = names.get(key);
    if (!row) continue;
    const tee = whsFromCourseTee(row, gender);
    if (!tee) continue;
    const visual = teeVisual(null, row);
    return { tee, ...visual };
  }
  return null;
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

type ResolvedTee = {
  tee: WhsTeeData;
  allowance_pct: number;
  tee_code: string | null;
  tee_name: string | null;
  tee_color: string | null;
  /** HI efectivo a usar para WHS. Si la regla del torneo tiene un tope
   *  (handicap_max) y el HI del jugador lo rebasa, aquí viene capado al
   *  máximo a jugar. */
  effective_hi: number;
  /** Razón del capeo si aplica. */
  hi_cap_source: "rule_max" | "rule_min" | null;
};

function resolveWhsTeeForEntry(
  entry: EntryForHandicap,
  ctx: TournamentHandicapContext
): ResolvedTee | null {
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

  const teeSetById = new Map(ctx.tournamentTeeSets.map((t) => [t.id, t]));

  // Override manual de salida: el comité eligió Blancas/Azules/etc.
  // Debe mandar sobre category_tee_rules (igual que la columna Salida en inscritos).
  const overrideId = entry.tee_set_id_override?.trim() || null;
  if (overrideId) {
    const tournamentTee = teeSetById.get(overrideId);
    if (tournamentTee) {
      const courseTee = findCourseTee(ctx, tournamentTee);
      if (courseTee) {
        const tee = whsFromCourseTee(courseTee, gender);
        if (tee) {
          const visual = teeVisual(tournamentTee, courseTee);
          return {
            tee,
            allowance_pct,
            ...visual,
            effective_hi: hi,
            hi_cap_source: null,
          };
        }
      }
    }
  }

  if (!categoryId) {
    const tee = pickTeeForGender({
      gender,
      men: ctx.matchplayFallback?.men ?? null,
      women: ctx.matchplayFallback?.women ?? null,
    });
    if (tee)
      return {
        tee,
        allowance_pct,
        tee_code: null,
        tee_name: null,
        tee_color: null,
        effective_hi: hi,
        hi_cap_source: null,
      };
    const byHi = pickCourseTeeByHi(ctx, hi, gender);
    if (byHi) {
      return {
        tee: byHi.tee,
        allowance_pct,
        tee_code: byHi.tee_code,
        tee_name: byHi.tee_name,
        tee_color: byHi.tee_color,
        effective_hi: hi,
        hi_cap_source: null,
      };
    }
    return null;
  }

  const player: Player = {
    id: entry.player_id,
    gender,
    handicap_index: hi,
    birth_year: entry.player?.birth_year ?? null,
    category_id: categoryId,
  };

  const teeSetsForAssign = ctx.tournamentTeeSets.map((t) => ({
    id: t.id,
    code: t.code ?? "",
    name: t.name ?? t.code ?? "",
  }));

  const assigned = assignTeeSetWithMeta(
    player,
    ctx.categoryTeeRules,
    teeSetsForAssign
  );
  if (assigned) {
    const tournamentTee = teeSetById.get(assigned.tee.id);
    if (tournamentTee) {
      const courseTee = findCourseTee(ctx, tournamentTee);
      if (courseTee) {
        const tee = whsFromCourseTee(courseTee, gender);
        if (tee) {
          // Aplicar tope a jugar: si la regla tiene handicap_max/min y el
          // jugador está fuera del rango (extrapolated), capar el HI al
          // límite indicado por el torneo.
          let effective_hi = hi;
          let hi_cap_source: ResolvedTee["hi_cap_source"] = null;
          if (assigned.match === "extrapolated") {
            const max = assigned.rule.handicap_max;
            const min = assigned.rule.handicap_min;
            if (max != null && hi > max) {
              effective_hi = Number(max);
              hi_cap_source = "rule_max";
            } else if (min != null && hi < min) {
              effective_hi = Number(min);
              hi_cap_source = "rule_min";
            }
          }
          const visual = teeVisual(tournamentTee, courseTee);
          return {
            tee,
            allowance_pct,
            ...visual,
            effective_hi,
            hi_cap_source,
          };
        }
      }
    }
  }

  const fbMen = ctx.matchplayFallback?.men ?? null;
  const fbWomen = ctx.matchplayFallback?.women ?? null;
  const tee = pickTeeForGender({ gender, men: fbMen, women: fbWomen });
  if (tee)
    return {
      tee,
      allowance_pct,
      tee_code: null,
      tee_name: null,
      tee_color: null,
      effective_hi: hi,
      hi_cap_source: null,
    };

  const byHi = pickCourseTeeByHi(ctx, hi, gender);
  if (byHi) {
    return {
      tee: byHi.tee,
      allowance_pct,
      tee_code: byHi.tee_code,
      tee_name: byHi.tee_name,
      tee_color: byHi.tee_color,
      effective_hi: hi,
      hi_cap_source: null,
    };
  }

  return null;
}

export type OfficialHcp80 = {
  hp: number;
  ch: number;
  chExact: number;
  hi: number;
  slope: number;
  course_rating: number;
  par: number;
  teeCode: string | null;
  teeName?: string | null;
  teeColor?: string | null;
  /** % de reglas del torneo (80, 100, …). */
  allowancePct?: number;
};

/** HP oficial del torneo: siempre CH_exact × 80% (half-up). */
export function resolveOfficialHcp80(
  entry: EntryForHandicap,
  ctx: TournamentHandicapContext
): OfficialHcp80 | null {
  const resolved = resolveWhsTeeForEntry(entry, ctx);
  if (!resolved) return null;
  const hi = resolved.effective_hi;
  if (!Number.isFinite(hi)) return null;
  const { chExact, ch, hp } = hiToChHpAtPct(
    hi,
    resolved.tee.slope,
    resolved.tee.course_rating,
    resolved.tee.par,
    80
  );
  return {
    hp,
    ch,
    chExact,
    hi,
    slope: resolved.tee.slope,
    course_rating: resolved.tee.course_rating,
    par: resolved.tee.par,
    teeCode: resolved.tee_code,
    teeName: resolved.tee_name,
    teeColor: resolved.tee_color,
    allowancePct: 80,
  };
}

export function formatOfficialHcp80Detail(d: OfficialHcp80): string {
  const tee = d.teeCode ? ` · ${d.teeCode}` : "";
  return `HP al 80% · HI ${d.hi.toFixed(1)}${tee} · Slope ${d.slope} · CR ${d.course_rating} · Par ${d.par} · CH ${d.chExact.toFixed(2)} → ${d.ch} · 80% = ${d.hp}`;
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

  const realHi = effectiveEntryHi(entry);
  const hiForCalc = resolved.effective_hi;
  const calc = computeWhsHandicap({
    hi: hiForCalc,
    slope: resolved.tee.slope,
    course_rating: resolved.tee.course_rating,
    par: resolved.tee.par,
    allowance_pct: resolved.allowance_pct,
  });

  return {
    ...calc,
    meta: {
      ...calc.meta,
      hi: realHi,
      tee_code: resolved.tee_code,
      category_id: entry.category_id,
      source:
        resolved.hi_cap_source != null
          ? "category_tee_whs_capped"
          : "category_tee_whs",
      hi_cap_applied: resolved.hi_cap_source != null ? hiForCalc : null,
      hi_cap_source: resolved.hi_cap_source,
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
