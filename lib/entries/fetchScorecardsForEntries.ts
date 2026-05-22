import type { SupabaseClient } from "@supabase/supabase-js";

const POSTGREST_PAGE = 1000;

const SCORECARD_SELECT_WITH_SIGNATURES = `
  id,
  entry_id,
  round_id,
  locked_at,
  scorecard_signatures (*)
`;

const SCORECARD_SELECT_BASIC = `
  id,
  entry_id,
  round_id,
  locked_at
`;

function isSignaturesEmbedError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const msg = String(error.message ?? "").toLowerCase();
  return (
    error.code === "PGRST200" ||
    error.code === "42703" ||
    msg.includes("scorecard_signatures") ||
    (msg.includes("relationship") && msg.includes("scorecard"))
  );
}

async function fetchScorecardPage(
  supabase: SupabaseClient,
  chunk: string[],
  from: number,
  withSignatures: boolean
) {
  const select = withSignatures
    ? SCORECARD_SELECT_WITH_SIGNATURES
    : SCORECARD_SELECT_BASIC;

  return supabase
    .from("scorecards")
    .select(select)
    .in("entry_id", chunk)
    .order("entry_id", { ascending: true })
    .order("round_id", { ascending: true })
    .range(from, from + POSTGREST_PAGE - 1);
}

/** Scorecards de inscritos (paginado; evita truncar firmas/cierre). */
export async function fetchScorecardsForEntries(
  supabase: SupabaseClient,
  entryIds: string[]
) {
  if (entryIds.length === 0) return [];

  const collected: unknown[] = [];
  let useSignatures = true;

  for (let i = 0; i < entryIds.length; i += 200) {
    const chunk = entryIds.slice(i, i + 200);
    let from = 0;

    for (;;) {
      let { data, error } = await fetchScorecardPage(
        supabase,
        chunk,
        from,
        useSignatures
      );

      if (error && useSignatures && isSignaturesEmbedError(error)) {
        useSignatures = false;
        console.warn(
          "[entries] scorecard_signatures no disponible, usando scorecards básicos:",
          error.message
        );
        ({ data, error } = await fetchScorecardPage(
          supabase,
          chunk,
          from,
          false
        ));
      }

      if (error) {
        console.error(
          `[entries] scorecards chunk ${i / 200 + 1}:`,
          error.message
        );
        return collected;
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
