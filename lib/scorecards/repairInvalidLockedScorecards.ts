import type { SupabaseClient } from "@supabase/supabase-js";
import { countHolesOnPlayerRound } from "@/lib/scorecards/countHolesOnPlayerRound";

export type InvalidLockedRow = {
  scorecard_id: string;
  entry_id: string;
  player_id: string;
  player_number: number | null;
  player_name: string;
  category_code: string | null;
  round_no: number;
  hole_count: number;
};

export type RepairInvalidLocksResult = {
  found: number;
  unlocked: number;
  errors: string[];
};

/**
 * Tarjetas con `locked_at` pero menos de 18 hoyos en esa misma fila `rounds`.
 */
export async function listInvalidLockedScorecardsForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<InvalidLockedRow[]> {
  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select("id, round_no")
    .eq("tournament_id", tournamentId);

  if (roundsErr || !rounds?.length) return [];

  const roundIds = rounds.map((r) => String(r.id));
  const roundNoById = new Map(
    rounds.map((r) => [String(r.id), Number(r.round_no)])
  );

  const { data: locked, error: scErr } = await admin
    .from("scorecards")
    .select("id, entry_id, round_id, locked_at")
    .in("round_id", roundIds)
    .not("locked_at", "is", null);

  if (scErr || !locked?.length) return [];

  const entryIds = [...new Set(locked.map((s) => String(s.entry_id)))];
  const { data: entries, error: entErr } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, player_number, player:players(first_name, last_name), category:categories(code)"
    )
    .in("id", entryIds);

  if (entErr) return [];

  const entryById = new Map((entries ?? []).map((e) => [String(e.id), e]));
  const out: InvalidLockedRow[] = [];

  for (const sc of locked) {
    const entry = entryById.get(String(sc.entry_id));
    if (!entry?.player_id) continue;

    const holeCount = await countHolesOnPlayerRound(
      admin,
      String(entry.player_id),
      String(sc.round_id)
    );

    if (holeCount >= 18) continue;

    const player = entry.player as {
      first_name?: string | null;
      last_name?: string | null;
    } | null;
    const name = [player?.first_name, player?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim();

    out.push({
      scorecard_id: String(sc.id),
      entry_id: String(sc.entry_id),
      player_id: String(entry.player_id),
      player_number:
        entry.player_number != null ? Number(entry.player_number) : null,
      player_name: name || "—",
      category_code:
        (entry.category as { code?: string } | null)?.code ?? null,
      round_no: roundNoById.get(String(sc.round_id)) ?? 0,
      hole_count: holeCount,
    });
  }

  out.sort((a, b) => {
    const na = a.player_number ?? 99999;
    const nb = b.player_number ?? 99999;
    return na - nb;
  });

  return out;
}

/** Quita `locked_at` en tarjetas cerradas sin 18 hoyos en su ronda. */
export async function repairInvalidLockedScorecardsForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<RepairInvalidLocksResult> {
  const invalid = await listInvalidLockedScorecardsForTournament(
    admin,
    tournamentId
  );

  const result: RepairInvalidLocksResult = {
    found: invalid.length,
    unlocked: 0,
    errors: [],
  };

  const now = new Date().toISOString();

  for (const row of invalid) {
    const { error } = await admin
      .from("scorecards")
      .update({
        locked_at: null,
        status: "open",
        updated_at: now,
      })
      .eq("id", row.scorecard_id);

    if (error) {
      result.errors.push(
        `#${row.player_number ?? "?"} ${row.player_name}: ${error.message}`
      );
      continue;
    }
    result.unlocked += 1;
  }

  return result;
}
