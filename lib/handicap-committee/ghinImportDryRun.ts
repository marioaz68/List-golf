import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedGhinRound } from "./parseHoleByHoleXlsx";

export type DryRunClass = "exact" | "new" | "date_conflict";

export type DryRunRow = ParsedGhinRound & {
  classification: DryRunClass;
  existingDate?: string;
};

export type DryRunReport = {
  exact: number;
  neu: number;
  dateConflict: number;
  ambiguousDates: number;
  dateMin: string | null;
  dateMax: string | null;
  sampleExact: DryRunRow[];
  sampleNew: DryRunRow[];
  sampleDateConflict: DryRunRow[];
  rows: DryRunRow[];
};

function keyFull(r: {
  ghin_number: string;
  date_played: string;
  tee_name: string;
  total_score: number;
}) {
  return `${r.ghin_number}|${r.date_played}|${r.tee_name}|${r.total_score}`;
}

function keyNoDate(r: {
  ghin_number: string;
  tee_name: string;
  total_score: number;
}) {
  return `${r.ghin_number}|${r.tee_name}|${r.total_score}`;
}

/**
 * Validación en seco contra ghin_rounds existentes.
 * date_conflict = mismo ghin+tee+score, fecha distinta (peligro de volteo).
 */
export async function dryRunGhinRounds(
  supabase: SupabaseClient,
  parsed: ParsedGhinRound[]
): Promise<DryRunReport> {
  const ghins = [...new Set(parsed.map((r) => r.ghin_number))];
  const existingFull = new Map<
    string,
    { date_played: string; tee_name: string; total_score: number }
  >();
  const existingByNoDate = new Map<string, string[]>(); // key → dates

  const chunk = 100;
  for (let i = 0; i < ghins.length; i += chunk) {
    const batch = ghins.slice(i, i + chunk);
    const { data, error } = await supabase
      .from("ghin_rounds")
      .select("ghin_number, date_played, tee_name, total_score")
      .in("ghin_number", batch);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) {
      const r = row as {
        ghin_number: string;
        date_played: string;
        tee_name: string;
        total_score: number;
      };
      existingFull.set(keyFull(r), r);
      const k = keyNoDate(r);
      const list = existingByNoDate.get(k) ?? [];
      list.push(String(r.date_played).slice(0, 10));
      existingByNoDate.set(k, list);
    }
  }

  const classified: DryRunRow[] = [];
  for (const p of parsed) {
    const full = keyFull(p);
    if (existingFull.has(full)) {
      classified.push({ ...p, classification: "exact" });
      continue;
    }
    const dates = existingByNoDate.get(keyNoDate(p)) ?? [];
    const other = dates.filter((d) => d !== p.date_played);
    if (other.length > 0) {
      classified.push({
        ...p,
        classification: "date_conflict",
        existingDate: other[0],
      });
      continue;
    }
    classified.push({ ...p, classification: "new" });
  }

  const exact = classified.filter((r) => r.classification === "exact");
  const neu = classified.filter((r) => r.classification === "new");
  const dateConflict = classified.filter(
    (r) => r.classification === "date_conflict"
  );
  const dates = classified.map((r) => r.date_played).sort();

  return {
    exact: exact.length,
    neu: neu.length,
    dateConflict: dateConflict.length,
    ambiguousDates: classified.filter((r) => r.date_ambiguous).length,
    dateMin: dates[0] ?? null,
    dateMax: dates[dates.length - 1] ?? null,
    sampleExact: exact.slice(0, 8),
    sampleNew: neu.slice(0, 8),
    sampleDateConflict: dateConflict.slice(0, 20),
    rows: classified,
  };
}

export type SanityCheck = {
  ok: boolean;
  nullHolesOrTotal: number;
  futureDates: number;
  exportCutoff: string | null;
  pctDayGt12: number;
  notes: string[];
};

export function postLoadSanityCheck(
  rows: ParsedGhinRound[],
  exportCutoff: string | null
): SanityCheck {
  let nullHolesOrTotal = 0;
  let futureDates = 0;
  let dayGt12 = 0;
  const notes: string[] = [];

  for (const r of rows) {
    if (r.total_score == null) nullHolesOrTotal++;
    const holeNulls = r.holes.filter((h) => h == null).length;
    if (holeNulls > 0) nullHolesOrTotal++;
    if (exportCutoff && r.date_played > exportCutoff) futureDates++;
    const day = Number(r.date_played.slice(8, 10));
    if (day > 12) dayGt12++;
  }

  const pctDayGt12 =
    rows.length > 0 ? Math.round((1000 * dayGt12) / rows.length) / 10 : 0;

  if (nullHolesOrTotal > 0) {
    notes.push(`${nullHolesOrTotal} filas con nulos en hoyos o total_score`);
  }
  if (futureDates > 0) {
    notes.push(
      `${futureDates} fechas posteriores al corte del export (${exportCutoff})`
    );
  }
  if (rows.length > 50 && pctDayGt12 < 5) {
    notes.push(
      `Solo ${pctDayGt12}% de días > 12 — posible intercambio día↔mes en este género`
    );
  }

  return {
    ok: nullHolesOrTotal === 0 && futureDates === 0,
    nullHolesOrTotal,
    futureDates,
    exportCutoff,
    pctDayGt12,
    notes,
  };
}

export function toInsertRow(
  r: ParsedGhinRound,
  sourceFile: string
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    ghin_number: r.ghin_number,
    golfer_name: r.golfer_name,
    gender: r.gender,
    date_played: r.date_played,
    score_type: r.score_type,
    tee_name: r.tee_name,
    tee_cr: r.tee_cr,
    tee_sr: r.tee_sr,
    hi_at_play: r.hi_at_play,
    course_handicap: r.course_handicap,
    total_score: r.total_score,
    differential: r.differential,
    source_file: sourceFile,
  };
  for (let i = 0; i < 18; i++) {
    out[`h${i + 1}`] = r.holes[i];
  }
  return out;
}
