import type { SupabaseClient } from "@supabase/supabase-js";
import type { StrokeIndexByHole } from "@/lib/leaderboard/handicapStrokes";

export type CourseLayout = {
  strokeIndexByHole: StrokeIndexByHole;
  parByHole: Map<number, number>;
};

/**
 * Carga par + stroke index por hoyo para un torneo.
 *
 * Estrategia:
 *  1) Lee `tournament_holes` (fuente preferida — puede tener overrides del comité).
 *  2) Para cada hoyo donde `par` o `handicap_index` venga null,
 *     consulta `course_holes` del campo asociado al torneo y rellena.
 *
 * Esto es lo que permite, p.ej., que en match play las ventajas se
 * apliquen en los hoyos correctos del campo aunque `tournament_holes`
 * no traiga `handicap_index` (caso común cuando el torneo se crea sin
 * importar la tarjeta del campo).
 */
export async function loadCourseLayoutForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<CourseLayout> {
  const strokeIndexByHole: StrokeIndexByHole = new Map();
  const parByHole = new Map<number, number>();

  const { data: tholes } = await admin
    .from("tournament_holes")
    .select("hole_number, par, handicap_index")
    .eq("tournament_id", tournamentId)
    .order("hole_number", { ascending: true });

  type Row = {
    hole_number: number;
    par: number | null;
    handicap_index: number | null;
  };

  let missingSi: number[] = [];
  let missingPar: number[] = [];

  for (const row of (tholes ?? []) as Row[]) {
    if (
      row.handicap_index != null &&
      Number.isFinite(Number(row.handicap_index))
    ) {
      strokeIndexByHole.set(row.hole_number, Number(row.handicap_index));
    } else {
      missingSi.push(row.hole_number);
    }
    if (row.par != null && Number.isFinite(Number(row.par))) {
      parByHole.set(row.hole_number, Number(row.par));
    } else {
      missingPar.push(row.hole_number);
    }
  }

  // Si no hay ningún registro en tournament_holes asumimos todos faltantes.
  if (!tholes || tholes.length === 0) {
    missingSi = Array.from({ length: 18 }, (_, i) => i + 1);
    missingPar = [...missingSi];
  }

  if (missingSi.length === 0 && missingPar.length === 0) {
    return { strokeIndexByHole, parByHole };
  }

  const { data: tournament } = await admin
    .from("tournaments")
    .select("course_id")
    .eq("id", tournamentId)
    .maybeSingle();

  const courseId = (tournament as { course_id: string | null } | null)
    ?.course_id;
  if (!courseId) return { strokeIndexByHole, parByHole };

  const { data: chs } = await admin
    .from("course_holes")
    .select("hole_number, par, handicap_index")
    .eq("course_id", courseId)
    .order("hole_number", { ascending: true });

  for (const row of (chs ?? []) as Row[]) {
    if (
      !strokeIndexByHole.has(row.hole_number) &&
      row.handicap_index != null &&
      Number.isFinite(Number(row.handicap_index))
    ) {
      strokeIndexByHole.set(row.hole_number, Number(row.handicap_index));
    }
    if (
      !parByHole.has(row.hole_number) &&
      row.par != null &&
      Number.isFinite(Number(row.par))
    ) {
      parByHole.set(row.hole_number, Number(row.par));
    }
  }

  return { strokeIndexByHole, parByHole };
}
