import type { SupabaseClient } from "@supabase/supabase-js";
import { derivePairingGroupMatches } from "@/lib/matchplay/derivePairingGroupMatches";

export type RevertMatchAdvanceResult =
  | {
      ok: true;
      reverted: boolean;
      matchplayMatchId: string | null;
      nextGroupRemoved: boolean;
      message: string;
    }
  | { ok: false; error: string };

/**
 * Deshace el cierre de un match de match play y su avance en el cuadro:
 * - match → in_progress sin ganador
 * - quita al ganador del slot en el partido siguiente
 * - elimina la salida auto-generada (pairing_group MATCH PLAY) de la ronda
 *   siguiente asociada a ese cruce, si existe
 */
export async function revertMatchAdvanceForGroup(
  admin: SupabaseClient,
  params: { tournamentId: string; groupId: string }
): Promise<RevertMatchAdvanceResult> {
  const tournamentId = String(params.tournamentId ?? "").trim();
  const groupId = String(params.groupId ?? "").trim();
  if (!tournamentId || !groupId) {
    return { ok: false, error: "Parámetros incompletos." };
  }

  const { data: groupRow } = await admin
    .from("pairing_groups")
    .select("id, round_id, group_no")
    .eq("id", groupId)
    .maybeSingle();
  const roundId = String(groupRow?.round_id ?? "").trim();
  const groupNo =
    typeof groupRow?.group_no === "number" ? groupRow.group_no : null;
  if (!roundId || groupNo == null) {
    return { ok: false, error: "Grupo no encontrado." };
  }

  const { data: roundRow } = await admin
    .from("rounds")
    .select("id, tournament_id, round_no")
    .eq("id", roundId)
    .maybeSingle();
  if (!roundRow?.tournament_id || roundRow.tournament_id !== tournamentId) {
    return { ok: false, error: "La ronda del grupo no pertenece a este torneo." };
  }
  const currentRoundNo = Number(roundRow.round_no ?? 0);

  const { data: bracket } = await admin
    .from("matchplay_brackets")
    .select("id")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!bracket?.id) {
    return {
      ok: true,
      reverted: false,
      matchplayMatchId: null,
      nextGroupRemoved: false,
      message: "No hay cuadro publicado; no se revirtió avance en bracket.",
    };
  }

  const derived = await derivePairingGroupMatches(admin, tournamentId);
  const derivedMatchId = `derived-${roundId}-g${groupNo}`;
  const derivedMatch = derived.matches.find((m) => m.id === derivedMatchId);
  if (
    !derivedMatch?.top_pair_id ||
    !derivedMatch.bottom_pair_id
  ) {
    return {
      ok: true,
      reverted: false,
      matchplayMatchId: null,
      nextGroupRemoved: false,
      message: "El grupo no tiene dos parejas; no hay match que revertir.",
    };
  }

  const topPairId = derivedMatch.top_pair_id;
  const bottomPairId = derivedMatch.bottom_pair_id;

  const { data: candidateMatches } = await admin
    .from("matchplay_matches")
    .select(
      "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status, next_match_id"
    )
    .eq("bracket_id", bracket.id)
    .eq("round_no", currentRoundNo);

  const realMatch = (candidateMatches ?? []).find(
    (m) =>
      (m.top_pair_id === topPairId && m.bottom_pair_id === bottomPairId) ||
      (m.top_pair_id === bottomPairId && m.bottom_pair_id === topPairId)
  );
  if (!realMatch?.id) {
    return {
      ok: true,
      reverted: false,
      matchplayMatchId: null,
      nextGroupRemoved: false,
      message: "No se encontró el partido del cuadro para este grupo.",
    };
  }

  const matchplayMatchId = String(realMatch.id);
  if (realMatch.status !== "completed" || !realMatch.winner_pair_id) {
    return {
      ok: true,
      reverted: false,
      matchplayMatchId,
      nextGroupRemoved: false,
      message: "El partido aún no estaba cerrado en el cuadro.",
    };
  }

  const winnerPairId = String(realMatch.winner_pair_id);
  let nextMatchId = realMatch.next_match_id as string | null;

  if (!nextMatchId) {
    const nextRound = currentRoundNo + 1;
    const nextPosition = Math.floor((Number(realMatch.position_no) - 1) / 2) + 1;
    const { data: nextMatch } = await admin
      .from("matchplay_matches")
      .select("id")
      .eq("bracket_id", bracket.id)
      .eq("round_no", nextRound)
      .eq("position_no", nextPosition)
      .maybeSingle();
    nextMatchId = nextMatch?.id ?? null;
  }

  const { error: reopenErr } = await admin
    .from("matchplay_matches")
    .update({
      winner_pair_id: null,
      status: "in_progress",
      result_text: null,
      holes_played: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", matchplayMatchId);
  if (reopenErr) {
    return {
      ok: false,
      error: `Error reabriendo partido: ${reopenErr.message}`,
    };
  }

  let nextGroupRemoved = false;

  if (nextMatchId) {
    const { data: nextMatch } = await admin
      .from("matchplay_matches")
      .select(
        "id, round_no, position_no, top_pair_id, bottom_pair_id, winner_pair_id, status"
      )
      .eq("id", nextMatchId)
      .maybeSingle();

    if (nextMatch) {
      const slotIsTop = (Number(realMatch.position_no) - 1) % 2 === 0;
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      if (slotIsTop) {
        if (nextMatch.top_pair_id === winnerPairId) patch.top_pair_id = null;
      } else if (nextMatch.bottom_pair_id === winnerPairId) {
        patch.bottom_pair_id = null;
      }

      if ("top_pair_id" in patch || "bottom_pair_id" in patch) {
        if (nextMatch.status === "completed") {
          patch.winner_pair_id = null;
          patch.status = "scheduled";
          patch.result_text = null;
          patch.holes_played = null;
        }
        await admin.from("matchplay_matches").update(patch).eq("id", nextMatchId);
      }

      const nextRoundNo = Number(nextMatch.round_no);
      const { data: nextRound } = await admin
        .from("rounds")
        .select("id")
        .eq("tournament_id", tournamentId)
        .eq("round_no", nextRoundNo)
        .maybeSingle();

      if (nextRound?.id) {
        const nextGroupNo = Number(nextMatch.position_no ?? 0);
        const { data: autoGroup } = await admin
          .from("pairing_groups")
          .select("id, notes")
          .eq("round_id", nextRound.id)
          .eq("group_no", nextGroupNo)
          .maybeSingle();

        const notes = String(autoGroup?.notes ?? "");
        if (autoGroup?.id && notes.startsWith("MATCH PLAY")) {
          await admin
            .from("pairing_group_members")
            .delete()
            .eq("group_id", autoGroup.id);
          await admin.from("pairing_groups").delete().eq("id", autoGroup.id);
          nextGroupRemoved = true;
        }
      }
    }
  }

  return {
    ok: true,
    reverted: true,
    matchplayMatchId,
    nextGroupRemoved,
    message: nextGroupRemoved
      ? "Partido reabierto en el cuadro y salida de la ronda siguiente eliminada. Corrige las tarjetas y vuelve a cerrar el grupo."
      : "Partido reabierto en el cuadro. Corrige las tarjetas y vuelve a cerrar el grupo.",
  };
}
