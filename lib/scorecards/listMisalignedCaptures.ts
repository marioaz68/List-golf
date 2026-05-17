import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveRoundIdForEntry, type RoundForEntryResolve } from "@/lib/rounds/resolveRoundForEntry";

export type MisalignedCaptureRow = {
  entry_id: string;
  player_id: string;
  player_number: number | null;
  player_name: string;
  entry_category_code: string | null;
  round_score_id: string;
  wrong_round_id: string;
  wrong_round_category_code: string | null;
  expected_round_id: string;
  expected_round_category_code: string | null;
  round_no: number;
  gross_score: number | null;
  hole_count: number;
};

/**
 * Detecta capturas en `round_scores` cuya categoría de ronda no coincide con la inscripción.
 */
export async function listMisalignedCapturesForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<MisalignedCaptureRow[]> {
  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select(
      "id, tournament_id, category_id, round_no, round_date, start_type, start_time, wave, category:categories(code)"
    )
    .eq("tournament_id", tournamentId);

  if (roundsErr || !rounds?.length) {
    return [];
  }

  const roundById = new Map(
    rounds.map((r) => [
      String(r.id),
      {
        ...r,
        category_code:
          (r as { category?: { code?: string } | null }).category?.code ?? null,
      },
    ])
  );

  const roundList = rounds as RoundForEntryResolve[];

  const { data: entries, error: entriesErr } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, player_number, category_id, player:players(first_name, last_name), category:categories(code)"
    )
    .eq("tournament_id", tournamentId);

  if (entriesErr || !entries?.length) {
    return [];
  }

  const entryByPlayer = new Map(
    entries.map((e) => [String(e.player_id), e])
  );

  const { data: roundScores, error: rsErr } = await admin
    .from("round_scores")
    .select("id, round_id, player_id, gross_score")
    .in(
      "round_id",
      rounds.map((r) => r.id)
    );

  if (rsErr || !roundScores?.length) {
    return [];
  }

  const rsIds = roundScores.map((r) => r.id);
  const holeCounts = new Map<string, number>();

  for (let i = 0; i < rsIds.length; i += 200) {
    const chunk = rsIds.slice(i, i + 200);
    const { data: holes } = await admin
      .from("hole_scores")
      .select("round_score_id")
      .in("round_score_id", chunk);

    for (const row of holes ?? []) {
      const id = String(row.round_score_id);
      holeCounts.set(id, (holeCounts.get(id) ?? 0) + 1);
    }
  }

  const misaligned: MisalignedCaptureRow[] = [];

  for (const rs of roundScores) {
    const entry = entryByPlayer.get(String(rs.player_id));
    if (!entry) continue;

    const wrongRound = roundById.get(String(rs.round_id));
    if (!wrongRound) continue;

    const expectedRoundId = resolveRoundIdForEntry(
      roundList,
      String(rs.round_id),
      entry.category_id
    );

    if (expectedRoundId === String(rs.round_id)) continue;

    const expectedRound = roundById.get(expectedRoundId);
    const player = entry.player as {
      first_name?: string | null;
      last_name?: string | null;
    } | null;

    misaligned.push({
      entry_id: String(entry.id),
      player_id: String(entry.player_id),
      player_number:
        entry.player_number != null ? Number(entry.player_number) : null,
      player_name: [player?.first_name, player?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim(),
      entry_category_code:
        (entry.category as { code?: string } | null)?.code ?? null,
      round_score_id: String(rs.id),
      wrong_round_id: String(rs.round_id),
      wrong_round_category_code: wrongRound.category_code,
      expected_round_id: expectedRoundId,
      expected_round_category_code: expectedRound?.category_code ?? null,
      round_no: Number(wrongRound.round_no ?? 0),
      gross_score: rs.gross_score != null ? Number(rs.gross_score) : null,
      hole_count: holeCounts.get(String(rs.id)) ?? 0,
    });
  }

  return misaligned.sort(
    (a, b) => (a.player_number ?? 9999) - (b.player_number ?? 9999)
  );
}
