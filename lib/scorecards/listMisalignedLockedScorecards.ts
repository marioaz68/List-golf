import type { SupabaseClient } from "@supabase/supabase-js";
import type { RoundForEntryResolve } from "@/lib/rounds/resolveRoundForEntry";

export type MisalignedLockedRow = {
  kind: "lock_wrong_category" | "needs_close_on_correct_round";
  entry_id: string;
  player_id: string;
  player_number: number | null;
  player_name: string;
  entry_category_code: string | null;
  round_no: number;
  /** round_id donde está el cierre hoy */
  locked_round_id: string | null;
  locked_round_category_code: string | null;
  /** round_id donde deberían estar scores/cierre */
  correct_round_id: string;
  correct_round_category_code: string | null;
  hole_count_on_correct: number;
  locked_at: string | null;
};

function holeNoFromRow(row: {
  hole_number?: number | null;
  hole_no?: number | null;
}) {
  const raw = row.hole_number ?? row.hole_no;
  if (raw == null) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 18 ? n : null;
}

/**
 * Jugadores cuya tarjeta cerrada no coincide con la categoría del inscrito,
 * o que tienen 18 hoyos en la ronda correcta pero sin cierre en esa fila `rounds`.
 */
export async function listMisalignedLockedScorecardsForTournament(
  admin: SupabaseClient,
  tournamentId: string
): Promise<MisalignedLockedRow[]> {
  const { data: rounds, error: roundsErr } = await admin
    .from("rounds")
    .select(
      "id, tournament_id, category_id, round_no, round_date, start_type, start_time, wave, category:categories(code)"
    )
    .eq("tournament_id", tournamentId);

  if (roundsErr || !rounds?.length) return [];

  const roundList = rounds as RoundForEntryResolve[];
  const roundById = new Map(
    rounds.map((r) => [
      String(r.id),
      {
        round_no: Number(r.round_no),
        category_id: r.category_id as string | null,
        category_code:
          (r as { category?: { code?: string } | null }).category?.code ?? null,
      },
    ])
  );

  const { data: entries, error: entriesErr } = await admin
    .from("tournament_entries")
    .select(
      "id, player_id, player_number, category_id, player:players(first_name, last_name), category:categories(code)"
    )
    .eq("tournament_id", tournamentId);

  if (entriesErr || !entries?.length) return [];

  const entryById = new Map(entries.map((e) => [String(e.id), e]));

  const { data: lockedCards, error: scErr } = await admin
    .from("scorecards")
    .select("entry_id, round_id, locked_at")
    .not("locked_at", "is", null)
    .in(
      "round_id",
      rounds.map((r) => r.id)
    );

  if (scErr) return [];

  const { data: roundScores, error: rsErr } = await admin
    .from("round_scores")
    .select("id, round_id, player_id")
    .in(
      "round_id",
      rounds.map((r) => r.id)
    );

  if (rsErr) return [];

  const rsByPlayerRound = new Map<string, string>();
  for (const rs of roundScores ?? []) {
    rsByPlayerRound.set(`${rs.player_id}_${rs.round_id}`, rs.id);
  }

  const rsIds = (roundScores ?? []).map((r) => r.id);
  const holeCountByRs = new Map<string, number>();
  if (rsIds.length > 0) {
    const pageSize = 1000;
    for (let i = 0; i < rsIds.length; i += pageSize) {
      const chunk = rsIds.slice(i, i + pageSize);
      const { data: holes } = await admin
        .from("hole_scores")
        .select("round_score_id, hole_number, hole_no")
        .in("round_score_id", chunk);
      for (const h of holes ?? []) {
        const rsId = String(h.round_score_id);
        const n = holeNoFromRow(h);
        if (n == null) continue;
        const set = holeCountByRs.get(rsId) ?? 0;
        holeCountByRs.set(rsId, set + 1);
      }
    }
  }

  const exactLock = new Set<string>();
  for (const sc of lockedCards ?? []) {
    if (!sc.entry_id || !sc.round_id || !sc.locked_at) continue;
    exactLock.add(`${sc.entry_id}_${sc.round_id}`);
  }

  const out: MisalignedLockedRow[] = [];
  const seen = new Set<string>();

  function push(row: MisalignedLockedRow) {
    const key = `${row.kind}_${row.entry_id}_${row.round_no}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(row);
  }

  for (const sc of lockedCards ?? []) {
    if (!sc.entry_id || !sc.round_id || !sc.locked_at) continue;
    const entry = entryById.get(String(sc.entry_id));
    if (!entry) continue;

    const roundMeta = roundById.get(String(sc.round_id));
    if (!roundMeta) continue;

    const entryCat = String(entry.category_id ?? "").trim();
    const roundCat = String(roundMeta.category_id ?? "").trim();
    if (!entryCat || !roundCat || entryCat === roundCat) continue;

    const correctRoundId = roundList.find(
      (r) =>
        Number(r.round_no) === roundMeta.round_no &&
        String(r.category_id ?? "").trim() === entryCat
    )?.id;

    if (!correctRoundId) continue;

    if (String(sc.round_id) === String(correctRoundId)) continue;

    const correctMeta = roundById.get(String(correctRoundId));
    const player = Array.isArray(entry.player) ? entry.player[0] : entry.player;
    const cat = Array.isArray(entry.category) ? entry.category[0] : entry.category;
    const name = [player?.first_name, player?.last_name].filter(Boolean).join(" ");

    const rsId = rsByPlayerRound.get(`${entry.player_id}_${correctRoundId}`);
    const holeCount = rsId ? holeCountByRs.get(rsId) ?? 0 : 0;

    push({
      kind: "lock_wrong_category",
      entry_id: String(entry.id),
      player_id: String(entry.player_id),
      player_number: entry.player_number,
      player_name: name,
      entry_category_code: cat?.code ?? null,
      round_no: roundMeta.round_no,
      locked_round_id: String(sc.round_id),
      locked_round_category_code: roundMeta.category_code,
      correct_round_id: String(correctRoundId),
      correct_round_category_code: correctMeta?.category_code ?? null,
      hole_count_on_correct: holeCount,
      locked_at: sc.locked_at,
    });
  }

  const roundNos = [...new Set(rounds.map((r) => Number(r.round_no)))].filter(
    (n) => n >= 1
  );

  for (const entry of entries) {
    const entryCat = String(entry.category_id ?? "").trim();
    if (!entryCat) continue;

    const player = Array.isArray(entry.player) ? entry.player[0] : entry.player;
    const cat = Array.isArray(entry.category) ? entry.category[0] : entry.category;
    const name = [player?.first_name, player?.last_name].filter(Boolean).join(" ");

    for (const roundNo of roundNos) {
      const correctRoundId = roundList.find(
        (r) =>
          Number(r.round_no) === roundNo &&
          String(r.category_id ?? "").trim() === entryCat
      )?.id;
      if (!correctRoundId) continue;

      const correctMeta = roundById.get(correctRoundId);
      if (!correctMeta) continue;

      const rsId = rsByPlayerRound.get(`${entry.player_id}_${correctRoundId}`);
      const holeCount = rsId ? holeCountByRs.get(rsId) ?? 0 : 0;
      if (holeCount < 18) continue;

      if (exactLock.has(`${entry.id}_${correctRoundId}`)) continue;

      push({
        kind: "needs_close_on_correct_round",
        entry_id: String(entry.id),
        player_id: String(entry.player_id),
        player_number: entry.player_number,
        player_name: name,
        entry_category_code: cat?.code ?? null,
        round_no: roundNo,
        locked_round_id: null,
        locked_round_category_code: null,
        correct_round_id: correctRoundId,
        correct_round_category_code: correctMeta.category_code,
        hole_count_on_correct: holeCount,
        locked_at: null,
      });
    }
  }

  return out.sort((a, b) => {
    const na = a.player_number ?? 99999;
    const nb = b.player_number ?? 99999;
    if (na !== nb) return na - nb;
    if (a.round_no !== b.round_no) return a.round_no - b.round_no;
    return a.kind.localeCompare(b.kind);
  });
}
