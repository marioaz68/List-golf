import type { SupabaseClient } from "@supabase/supabase-js";
import {
  maybeCreateNextRoundGroup,
  type MaybeCreateNextRoundGroupResult,
} from "@/lib/matchplay/maybeCreateNextRoundGroup";

export type AdvanceWinnerResult = {
  advanced: boolean;
  next_match_id: string | null;
  message: string;
  /**
   * Resultado de la creación/actualización automática de la salida
   * (`pairing_group`) de la ronda siguiente cuando el match siguiente ya
   * quedó con ambas parejas. `null` si no se intentó (BYE, no hay
   * siguiente, etc.) o si `autoCreateNextGroup === false`.
   */
  next_group?: MaybeCreateNextRoundGroupResult | null;
};

/**
 * Coloca al ganador en el slot del partido siguiente (cuadro eliminación
 * directa). Si el partido siguiente ya queda con AMBAS parejas, también
 * crea/actualiza automáticamente la salida (`pairing_group`) de esa ronda
 * en el calendario, salvo que se pase `autoCreateNextGroup: false`.
 */
export async function advanceWinnerInBracket(
  admin: SupabaseClient,
  params: {
    match_id: string;
    winner_pair_id: string;
    /** Default true. Cuando true, intenta crear la salida de la siguiente
     *  ronda en `pairing_groups` si el siguiente match ya tiene ambas
     *  parejas. */
    autoCreateNextGroup?: boolean;
  }
): Promise<AdvanceWinnerResult> {
  const { match_id, winner_pair_id } = params;
  const autoCreate = params.autoCreateNextGroup !== false;

  const { data: match, error: matchErr } = await admin
    .from("matchplay_matches")
    .select(
      "id, bracket_id, round_no, position_no, next_match_id, top_pair_id, bottom_pair_id, tournament_id"
    )
    .eq("id", match_id)
    .maybeSingle();

  if (matchErr || !match) {
    return {
      advanced: false,
      next_match_id: null,
      message: matchErr?.message ?? "Partido no encontrado.",
      next_group: null,
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
      next_group: null,
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
      next_group: null,
    };
  }

  const { data: nextRow } = await admin
    .from("matchplay_matches")
    .select(
      "id, top_pair_id, bottom_pair_id, winner_pair_id, status, tournament_id"
    )
    .eq("id", nextMatchId)
    .maybeSingle();

  // Cascada BYE: si el siguiente partido queda con un solo lado, ya cuenta
  // como BYE y debe avanzar a su propio siguiente match. Lo manejamos antes
  // de intentar crear salidas (porque un BYE no necesita salida).
  if (nextRow && nextRow.status === "bye") {
    await resolveNextMatchBye(admin, nextRow, autoCreate);
  }

  let nextGroup: MaybeCreateNextRoundGroupResult | null = null;
  if (autoCreate) {
    const tournamentId =
      (match.tournament_id as string | null) ??
      (nextRow?.tournament_id as string | null) ??
      null;
    if (tournamentId) {
      try {
        nextGroup = await maybeCreateNextRoundGroup(admin, {
          tournamentId,
          nextMatchId,
        });
      } catch (err) {
        nextGroup = {
          ok: false,
          created: false,
          groupNo: null,
          roundId: null,
          teeTime: null,
          reason: "insert_failed",
        };
        console.error(
          "[advanceWinnerInBracket] maybeCreateNextRoundGroup falló:",
          err
        );
      }
    }
  }

  const groupNote = nextGroup?.created
    ? ` Salida creada (G${nextGroup.groupNo}${
        nextGroup.teeTime ? ` · ${nextGroup.teeTime}` : ""
      }).`
    : nextGroup?.updated
      ? ` Salida actualizada (G${nextGroup.groupNo}${
          nextGroup.teeTime ? ` · ${nextGroup.teeTime}` : ""
        }).`
      : "";

  return {
    advanced: true,
    next_match_id: nextMatchId,
    message: `Ganador avanzado al siguiente partido del cuadro.${groupNote}`,
    next_group: nextGroup,
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
  },
  autoCreate: boolean
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
      autoCreateNextGroup: autoCreate,
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
      autoCreateNextGroup: autoCreate,
    });
  }
}
