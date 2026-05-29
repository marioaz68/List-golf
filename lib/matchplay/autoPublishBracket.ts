import type { SupabaseClient } from "@supabase/supabase-js";
import { loadMatchPlayTeamsData } from "@/lib/matchplay/loadMatchPlayTeamsData";
import { generateSingleElimBracket } from "@/lib/matchplay/generateSingleElimBracket";
import type { MatchPlaySeedingMethod } from "@/lib/matchplay/types";

export type AutoPublishBracketResult =
  | {
      ok: true;
      bracketId: string;
      teamCount: number;
      bracketSize: number;
      byeCount: number;
      message: string;
    }
  | { ok: false; error: string };

/**
 * Genera el cuadro de match play a partir de los equipos del torneo y lo
 * publica en un solo paso. Útil para que el comité no tenga que entrar a
 * /matchplay si ya tiene los equipos definidos y solo necesita avanzar.
 *
 * Reglas:
 * - Si ya existe un bracket lo borra y regenera (mismo comportamiento que
 *   `generateMatchPlayBracket` desde la UI). Esto sólo es seguro si todavía
 *   no se han registrado avances de ganadores; el panel que llama a este
 *   endpoint lo usa precisamente cuando el bracket aún no se ha publicado.
 * - Deja el cuadro en estado `published`.
 */
export async function autoPublishBracket(
  admin: SupabaseClient,
  tournamentId: string
): Promise<AutoPublishBracketResult> {
  const data = await loadMatchPlayTeamsData(tournamentId);

  if (data.teams.length < 2) {
    return {
      ok: false,
      error: "Necesitas al menos 2 equipos antes de generar el cuadro.",
    };
  }

  const { data: rulesRow } = await admin
    .from("tournament_matchplay_rules")
    .select("seeding_method, bracket_main_pairs, max_pairs_per_category")
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  const seeding_method = (rulesRow?.seeding_method ??
    "hi_combined") as MatchPlaySeedingMethod;
  const maxSize =
    (rulesRow as { bracket_main_pairs?: number | null; max_pairs_per_category?: number | null } | null)?.bracket_main_pairs ??
    (rulesRow as { max_pairs_per_category?: number | null } | null)?.max_pairs_per_category ??
    64;

  let generated;
  try {
    generated = generateSingleElimBracket({
      teams: data.teams,
      seeding_method,
      max_bracket_size: maxSize,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "No se pudo generar el cuadro.",
    };
  }

  const { data: existingBrackets } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId);
  if (existingBrackets?.length) {
    const ids = existingBrackets.map((b) => b.id);
    await admin.from("matchplay_brackets").delete().in("id", ids);
  }

  for (const s of generated.seedAssignments) {
    await admin
      .from("matchplay_pair_teams")
      .update({ seed: s.seed, updated_at: new Date().toISOString() })
      .eq("id", s.team_id);
  }

  const category_id = data.categories[0]?.id ?? null;

  const { data: bracket, error: bracketErr } = await admin
    .from("matchplay_brackets")
    .insert({
      tournament_id: tournamentId,
      category_id,
      name: "Principal",
      bracket_type: "single_elim",
      status: "published",
      config_json: {
        bracket_size: generated.bracketSize,
        round_count: generated.roundCount,
        seeding_method,
        team_count: generated.teamCount,
        bye_count: generated.byeCount,
        draw: "standard",
      },
    })
    .select("id")
    .single();

  if (bracketErr || !bracket?.id) {
    return {
      ok: false,
      error: bracketErr?.message ?? "No se pudo crear el bracket.",
    };
  }

  const insertRows = generated.matches.map((m) => ({
    tournament_id: tournamentId,
    bracket_id: bracket.id,
    round_no: m.round_no,
    position_no: m.position_no,
    top_pair_id: m.top_pair_id,
    bottom_pair_id: m.bottom_pair_id,
    winner_pair_id: m.winner_pair_id,
    status: m.status,
    result_text: m.result_text,
  }));

  const { data: inserted, error: matchErr } = await admin
    .from("matchplay_matches")
    .insert(insertRows)
    .select("id, round_no, position_no");

  if (matchErr) {
    return { ok: false, error: matchErr.message };
  }

  const idByKey = new Map<string, string>();
  for (const row of inserted ?? []) {
    idByKey.set(
      `r${row.round_no}-p${row.position_no - 1}`,
      String(row.id)
    );
  }
  for (const m of generated.matches) {
    if (!m._next_key) continue;
    const id = idByKey.get(m._key);
    const nextId = idByKey.get(m._next_key);
    if (id && nextId) {
      await admin
        .from("matchplay_matches")
        .update({ next_match_id: nextId })
        .eq("id", id);
    }
  }

  return {
    ok: true,
    bracketId: String(bracket.id),
    teamCount: generated.teamCount,
    bracketSize: generated.bracketSize,
    byeCount: generated.byeCount,
    message: `Cuadro generado y publicado: ${generated.teamCount} equipos, ${generated.bracketSize} plazas, ${generated.byeCount} BYE(s).`,
  };
}
