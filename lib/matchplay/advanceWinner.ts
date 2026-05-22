import type { SupabaseClient } from "@supabase/supabase-js";

export type AdvanceWinnerResult = {
  advanced: boolean;
  next_match_id: string | null;
  message: string;
};

/** Coloca al ganador en el slot del partido siguiente (cuadro eliminación directa). */
export async function advanceWinnerInBracket(
  admin: SupabaseClient,
  params: { match_id: string; winner_pair_id: string }
): Promise<AdvanceWinnerResult> {
  const { match_id, winner_pair_id } = params;

  const { data: match, error: matchErr } = await admin
    .from("matchplay_matches")
    .select(
      "id, bracket_id, round_no, position_no, next_match_id, top_pair_id, bottom_pair_id"
    )
    .eq("id", match_id)
    .maybeSingle();

  if (matchErr || !match) {
    return {
      advanced: false,
      next_match_id: null,
      message: matchErr?.message ?? "Partido no encontrado.",
    };
  }

  let nextMatchId = match.next_match_id as string | null;

  if (!nextMatchId) {
    const nextRound = match.round_no + 1;
    const nextPosition = Math.floor((match.position_no - 1) / 2) + 1;

    const { data: nextMatch } = await admin
      .from("matchplay_matches")
      .select("id")
      .eq("bracket_id", match.bracket_id)
      .eq("round_no", nextRound)
      .eq("position_no", nextPosition)
      .maybeSingle();

    nextMatchId = nextMatch?.id ?? null;
  }

  if (!nextMatchId) {
    return {
      advanced: false,
      next_match_id: null,
      message: "Campeón del cuadro — no hay partido siguiente.",
    };
  }

  const slotIsTop = (match.position_no - 1) % 2 === 0;
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (slotIsTop) {
    patch.top_pair_id = winner_pair_id;
  } else {
    patch.bottom_pair_id = winner_pair_id;
  }

  const { error: patchErr } = await admin
    .from("matchplay_matches")
    .update(patch)
    .eq("id", nextMatchId);

  if (patchErr) {
    return {
      advanced: false,
      next_match_id: nextMatchId,
      message: patchErr.message,
    };
  }

  const { data: nextRow } = await admin
    .from("matchplay_matches")
    .select("id, top_pair_id, bottom_pair_id, winner_pair_id, status")
    .eq("id", nextMatchId)
    .maybeSingle();

  if (nextRow) {
    await resolveNextMatchBye(admin, nextRow);
  }

  return {
    advanced: true,
    next_match_id: nextMatchId,
    message: "Ganador avanzado al siguiente partido del cuadro.",
  };
}

async function resolveNextMatchBye(
  admin: SupabaseClient,
  m: {
    id: string;
    top_pair_id: string | null;
    bottom_pair_id: string | null;
    winner_pair_id: string | null;
    status: string;
  }
) {
  const top = m.top_pair_id;
  const bottom = m.bottom_pair_id;

  if (top && !bottom) {
    await admin
      .from("matchplay_matches")
      .update({
        winner_pair_id: top,
        status: "bye",
        result_text: "BYE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    await advanceWinnerInBracket(admin, {
      match_id: m.id,
      winner_pair_id: top,
    });
  } else if (!top && bottom) {
    await admin
      .from("matchplay_matches")
      .update({
        winner_pair_id: bottom,
        status: "bye",
        result_text: "BYE",
        updated_at: new Date().toISOString(),
      })
      .eq("id", m.id);
    await advanceWinnerInBracket(admin, {
      match_id: m.id,
      winner_pair_id: bottom,
    });
  }
}
