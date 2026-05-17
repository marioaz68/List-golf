import type { SupabaseClient } from "@supabase/supabase-js";

const POSTGREST_PAGE = 1000;

/** Scorecards de inscritos (paginado; evita truncar firmas/cierre). */
export async function fetchScorecardsForEntries(
  supabase: SupabaseClient,
  entryIds: string[]
) {
  if (entryIds.length === 0) return [];

  const collected: unknown[] = [];

  for (let i = 0; i < entryIds.length; i += 200) {
    const chunk = entryIds.slice(i, i + 200);
    let from = 0;

    for (;;) {
      const { data, error } = await supabase
        .from("scorecards")
        .select(`
          id,
          entry_id,
          round_id,
          locked_at,
          scorecard_signatures (*)
        `)
        .in("entry_id", chunk)
        .order("entry_id", { ascending: true })
        .order("round_id", { ascending: true })
        .range(from, from + POSTGREST_PAGE - 1);

      if (error) {
        throw new Error(`Error leyendo scorecards con firmas: ${error.message}`);
      }

      const batch = data ?? [];
      collected.push(...batch);

      if (batch.length < POSTGREST_PAGE) break;
      from += POSTGREST_PAGE;
      if (from > 50_000) break;
    }
  }

  return collected;
}
