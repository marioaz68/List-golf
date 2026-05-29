import type { SupabaseClient } from "@supabase/supabase-js";
import { advanceWinnerInBracket } from "@/lib/matchplay/advanceWinner";

export type CompleteBracketResult =
  | {
      ok: true;
      roundsCompleted: number;
      championPairId: string;
      message: string;
    }
  | { ok: false; error: string };

type MatchRow = {
  id: string;
  round_no: number;
  position_no: number;
  top_pair_id: string | null;
  bottom_pair_id: string | null;
  winner_pair_id: string | null;
  status: string | null;
};

/** Cierra partidos programados (ganador = top) y avanza hasta la final. */
export async function completeBracketToChampion(
  admin: SupabaseClient,
  tournamentId: string,
  bracketId: string
): Promise<CompleteBracketResult> {
  const seedByPair = new Map<string, number>();
  const { data: pairs } = await admin
    .from("matchplay_pair_teams")
    .select("id, seed")
    .eq("tournament_id", tournamentId)
    .eq("is_active", true);
  for (const p of pairs ?? []) {
    seedByPair.set(String(p.id), Number(p.seed ?? 999));
  }

  let roundsCompleted = 0;
  let safety = 0;

  while (safety++ < 200) {
    const { data: matches } = await admin
      .from("matchplay_matches")
      .select(
        "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status"
      )
      .eq("bracket_id", bracketId)
      .order("round_no", { ascending: true })
      .order("position_no", { ascending: true });

    const rows = (matches ?? []) as MatchRow[];
    const pending = rows.filter(
      (m) =>
        m.status !== "completed" &&
        m.top_pair_id &&
        m.bottom_pair_id &&
        m.status !== "bye"
    );

    if (pending.length === 0) {
      const final = rows
        .filter((m) => !rows.some((x) => x.round_no > m.round_no))
        .find((m) => m.winner_pair_id);
      if (final?.winner_pair_id) {
        return {
          ok: true,
          roundsCompleted,
          championPairId: String(final.winner_pair_id),
          message: `Campeón definido en R${final.round_no} (pareja ${final.winner_pair_id}).`,
        };
      }
      // Cerrar BYEs pendientes que bloquean la final
      const byePending = rows.filter(
        (m) =>
          m.status === "bye" &&
          m.winner_pair_id &&
          m.top_pair_id &&
          !m.bottom_pair_id
      );
      if (byePending.length === 0) {
        return {
          ok: false,
          error: "No quedan partidos jugables ni campeón en la final.",
        };
      }
      for (const m of byePending) {
        await advanceWinnerInBracket(admin, {
          match_id: m.id,
          winner_pair_id: String(m.winner_pair_id),
        });
      }
      continue;
    }

    pending.sort((a, b) => a.round_no - b.round_no || a.position_no - b.position_no);
    const m = pending[0];
    const top = String(m.top_pair_id);
    const bottom = String(m.bottom_pair_id);
    const topSeed = seedByPair.get(top) ?? 999;
    const botSeed = seedByPair.get(bottom) ?? 999;
    const winner = topSeed <= botSeed ? top : bottom;

    await admin
      .from("matchplay_matches")
      .update({
        winner_pair_id: winner,
        status: "completed",
        result_text: "Prueba · mejor seed",
        holes_played: 18,
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);

    await advanceWinnerInBracket(admin, {
      match_id: m.id,
      winner_pair_id: winner,
    });
    roundsCompleted += 1;
  }

  return { ok: false, error: "Demasiadas iteraciones completando el cuadro." };
}
