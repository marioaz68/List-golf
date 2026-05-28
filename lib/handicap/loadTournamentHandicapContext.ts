import type { SupabaseClient } from "@supabase/supabase-js";
import type { Rule } from "@/lib/tee-assignment";
import {
  type CourseTeeForHandicap,
  type TournamentHandicapContext,
} from "@/lib/handicap/resolveTournamentEntryHandicap";
import type { WhsTeeData } from "@/lib/handicap/whs";

function normalizeTeeCode(code: string | null | undefined): string {
  return String(code ?? "")
    .trim()
    .toUpperCase();
}

export async function loadTournamentHandicapContext(
  admin: SupabaseClient,
  tournamentId: string
): Promise<TournamentHandicapContext> {
  const { data: tournament } = await admin
    .from("tournaments")
    .select("course_id")
    .eq("id", tournamentId)
    .maybeSingle();

  const courseId = (tournament as { course_id?: string | null } | null)?.course_id;

  const [
    teeSetsRes,
    rulesRes,
    compRulesRes,
    courseTeesRes,
    mpRulesRes,
  ] = await Promise.all([
    admin
      .from("tee_sets")
      .select("id, code")
      .eq("tournament_id", tournamentId),
    admin
      .from("category_tee_rules")
      .select(
        "id, category_id, tee_set_id, priority, age_min, age_max, gender, handicap_min, handicap_max"
      )
      .eq("tournament_id", tournamentId)
      .order("priority", { ascending: true }),
    admin
      .from("category_competition_rules")
      .select("category_id, handicap_percentage, is_active")
      .eq("tournament_id", tournamentId)
      .eq("is_active", true),
    courseId
      ? admin
          .from("course_tee_sets")
          .select(
            "code, slope_men, slope_women, course_rating_men, course_rating_women, par"
          )
          .eq("course_id", courseId)
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("tournament_matchplay_rules")
      .select(
        "handicap_allowance_pct, whs_slope_men, whs_slope_women, whs_course_rating_men, whs_course_rating_women, whs_par_men, whs_par_women"
      )
      .eq("tournament_id", tournamentId)
      .maybeSingle(),
  ]);

  const allowancePctByCategory = new Map<string, number>();
  for (const r of compRulesRes.data ?? []) {
    const cid = String((r as { category_id: string }).category_id ?? "").trim();
    if (!cid) continue;
    const pct = Number((r as { handicap_percentage: number }).handicap_percentage);
    if (Number.isFinite(pct)) allowancePctByCategory.set(cid, pct);
  }

  const courseTeesByCode = new Map<string, CourseTeeForHandicap>();
  for (const row of courseTeesRes.data ?? []) {
    const code = normalizeTeeCode((row as { code: string | null }).code);
    if (!code) continue;
    courseTeesByCode.set(code, row as CourseTeeForHandicap);
  }

  const categoryTeeRules: Rule[] = (rulesRes.data ?? []).map((r) => ({
    id: (r as { id: string }).id,
    category_id: (r as { category_id: string }).category_id,
    tee_set_id: (r as { tee_set_id: string }).tee_set_id,
    priority: Number((r as { priority: number | null }).priority ?? 999),
    age_min: (r as { age_min: number | null }).age_min,
    age_max: (r as { age_max: number | null }).age_max,
    gender: (r as { gender: Rule["gender"] }).gender,
    handicap_min: (r as { handicap_min: number | null }).handicap_min,
    handicap_max: (r as { handicap_max: number | null }).handicap_max,
  }));

  let matchplayFallback: TournamentHandicapContext["matchplayFallback"];
  const mp = mpRulesRes.data;
  if (mp) {
    const allowance_pct = Number(
      (mp as { handicap_allowance_pct: number | null }).handicap_allowance_pct ?? 100
    );
    const men: Partial<WhsTeeData> | null =
      (mp as { whs_slope_men: number | null }).whs_slope_men != null
        ? {
            slope: Number((mp as { whs_slope_men: number }).whs_slope_men),
            course_rating: Number(
              (mp as { whs_course_rating_men: number }).whs_course_rating_men ?? 0
            ),
            par: Number((mp as { whs_par_men: number }).whs_par_men ?? 72),
          }
        : null;
    const women: Partial<WhsTeeData> | null =
      (mp as { whs_slope_women: number | null }).whs_slope_women != null
        ? {
            slope: Number((mp as { whs_slope_women: number }).whs_slope_women),
            course_rating: Number(
              (mp as { whs_course_rating_women: number }).whs_course_rating_women ?? 0
            ),
            par: Number((mp as { whs_par_women: number }).whs_par_women ?? 72),
          }
        : null;
    if (men || women) {
      matchplayFallback = { allowance_pct, men, women };
    }
  }

  return {
    tournamentTeeSets: (teeSetsRes.data ?? []).map((t) => ({
      id: (t as { id: string }).id,
      code: (t as { code: string | null }).code,
    })),
    categoryTeeRules,
    allowancePctByCategory,
    courseTeesByCode,
    matchplayFallback,
  };
}
