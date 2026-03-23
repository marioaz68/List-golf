"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/utils/supabase/server";
import { requireTournamentAccess } from "@/lib/auth/requireTournamentAccess";

export type SaveScoresState = {
  ok: boolean;
  message: string;
};

function asInt(v: FormDataEntryValue | null) {
  const raw = String(v ?? "").trim();
  if (!raw) return 0;

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function supabaseErrText(err: unknown) {
  if (!err || typeof err !== "object") return "Error desconocido";

  const e = err as {
    message?: string;
    code?: string;
    details?: string | null;
    hint?: string | null;
  };

  return [
    e.message ? `message: ${e.message}` : "",
    e.code ? `code: ${e.code}` : "",
    e.details ? `details: ${e.details}` : "",
    e.hint ? `hint: ${e.hint}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

async function getTournamentIdFromRoundId(supabase: any, roundId: string) {
  const { data, error } = await supabase
    .from("rounds")
    .select("id, tournament_id")
    .eq("id", roundId)
    .single();

  if (error || !data) {
    throw new Error("No se encontró la ronda");
  }

  return String(data.tournament_id);
}

export async function savePlayerScores(
  _prevState: SaveScoresState,
  formData: FormData
): Promise<SaveScoresState> {
  try {
    const supabase = await createClient();

    const roundId = String(formData.get("round_id") ?? "").trim();
    const playerId = String(formData.get("player_id") ?? "").trim();
    const tournamentDayId = String(formData.get("tournament_day_id") ?? "").trim();

    if (!roundId) {
      return { ok: false, message: "Falta round_id" };
    }

    if (!playerId) {
      return { ok: false, message: "Falta player_id" };
    }

    const tournamentId = await getTournamentIdFromRoundId(supabase, roundId);

    await requireTournamentAccess({
      tournamentId,
      allowedRoles: [
        "super_admin",
        "club_admin",
        "tournament_director",
        "score_capture",
      ],
    });

    const grossScores: { hole_number: number; strokes: number }[] = [];

    for (let hole = 1; hole <= 18; hole++) {
      const strokes = asInt(formData.get(`hole_${hole}`));

      if (strokes <= 0) continue;

      if (strokes > 15) {
        return {
          ok: false,
          message: `Score inválido en hoyo ${hole}. Máximo permitido: 15.`,
        };
      }

      grossScores.push({ hole_number: hole, strokes });
    }

    const grossTotal = grossScores.reduce((acc, x) => acc + x.strokes, 0);

    const { data: existingRoundScore, error: existingErr } = await supabase
      .from("round_scores")
      .select("id")
      .eq("round_id", roundId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existingErr) {
      return {
        ok: false,
        message: `Error buscando round_scores: ${supabaseErrText(existingErr)}`,
      };
    }

    let roundScoreId = existingRoundScore?.id as string | undefined;

    if (!roundScoreId) {
      const { data: inserted, error: insertErr } = await supabase
        .from("round_scores")
        .insert({
          round_id: roundId,
          player_id: playerId,
          gross_score: grossTotal || null,
        })
        .select("id")
        .single();

      if (insertErr) {
        return {
          ok: false,
          message: `Error insertando round_scores: ${supabaseErrText(insertErr)}`,
        };
      }

      roundScoreId = inserted.id;
    } else {
      const { error: updateErr } = await supabase
        .from("round_scores")
        .update({
          gross_score: grossTotal || null,
        })
        .eq("id", roundScoreId);

      if (updateErr) {
        return {
          ok: false,
          message: `Error actualizando round_scores: ${supabaseErrText(updateErr)}`,
        };
      }
    }

    if (!roundScoreId) {
      return {
        ok: false,
        message: "No se pudo determinar el id de round_scores.",
      };
    }

    if (grossScores.length === 0) {
      const { error: deleteAllErr } = await supabase
        .from("hole_scores")
        .delete()
        .eq("round_score_id", roundScoreId);

      if (deleteAllErr) {
        return {
          ok: false,
          message: `Error borrando hole_scores: ${supabaseErrText(deleteAllErr)}`,
        };
      }

      const { error: resetTotalErr } = await supabase
        .from("round_scores")
        .update({ gross_score: null })
        .eq("id", roundScoreId);

      if (resetTotalErr) {
        return {
          ok: false,
          message: `Error actualizando total de ronda: ${supabaseErrText(resetTotalErr)}`,
        };
      }

      revalidatePath("/score-entry");

      return {
        ok: true,
        message: "Se limpiaron los scores de esta ronda para el jugador.",
      };
    }

    const rows = grossScores.map((x) => ({
      round_score_id: roundScoreId,
      hole_number: x.hole_number,
      strokes: x.strokes,
      ...(tournamentDayId ? { tournament_day_id: tournamentDayId } : {}),
    }));

    const { error: upsertErr } = await supabase.from("hole_scores").upsert(rows, {
      onConflict: "round_score_id,hole_number",
    });

    if (upsertErr) {
      return {
        ok: false,
        message: `Error guardando hole_scores: ${supabaseErrText(upsertErr)}`,
      };
    }

    const keepHoleNumbers = grossScores.map((x) => x.hole_number);
    const keepList = `(${keepHoleNumbers.join(",")})`;

    const { error: deleteRemovedErr } = await supabase
      .from("hole_scores")
      .delete()
      .eq("round_score_id", roundScoreId)
      .not("hole_number", "in", keepList);

    if (deleteRemovedErr) {
      return {
        ok: false,
        message: `Error borrando hoyos vacíos: ${supabaseErrText(deleteRemovedErr)}`,
      };
    }

    const { error: finalUpdateErr } = await supabase
      .from("round_scores")
      .update({
        gross_score: grossTotal || null,
      })
      .eq("id", roundScoreId);

    if (finalUpdateErr) {
      return {
        ok: false,
        message: `Error actualizando gross_score: ${supabaseErrText(finalUpdateErr)}`,
      };
    }

    revalidatePath("/score-entry");

    return {
      ok: true,
      message: `Scores guardados correctamente (${grossScores.length} hoyos). Total: ${grossTotal}.`,
    };
  } catch (err) {
    console.error("savePlayerScores ERROR:", err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Error inesperado al guardar",
    };
  }
}