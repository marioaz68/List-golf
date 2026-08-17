import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export type DrawNextAuctionPairResult =
  | {
      ok: true;
      teamId: string;
      auctionOrder: number;
      totalActive: number;
      pendingAfter: number;
    }
  | { ok: false; error: string; code: "empty" | "busy" | "error" };

/**
 * Sortea UNA pareja pendiente y persiste auction_order (+ auditoría)
 * ANTES de devolver. El azar vive aquí, no en el cliente.
 *
 * Protección contra doble clic: el UPDATE exige auction_order IS NULL;
 * si otro giro ganó la carrera, se reintenta con el pool actualizado.
 */
export async function drawNextAuctionPair(
  admin: SupabaseClient,
  params: { tournamentId: string; userId: string | null }
): Promise<DrawNextAuctionPairResult> {
  const tournamentId = params.tournamentId.trim();
  if (!tournamentId) {
    return { ok: false, error: "Falta tournament_id.", code: "error" };
  }

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: teams, error } = await admin
      .from("matchplay_pair_teams")
      .select("id, auction_order, is_active")
      .eq("tournament_id", tournamentId)
      .eq("is_active", true);

    if (error) {
      return { ok: false, error: error.message, code: "error" };
    }

    const list = teams ?? [];
    const totalActive = list.length;
    const pending = list.filter(
      (t) => t.auction_order === null || t.auction_order === undefined
    );
    if (pending.length === 0) {
      return {
        ok: false,
        error: "No quedan parejas por sortear.",
        code: "empty",
      };
    }

    const maxOrder = list.reduce((m, t) => {
      const n = typeof t.auction_order === "number" ? t.auction_order : 0;
      return n > m ? n : m;
    }, 0);
    const nextOrder = maxOrder + 1;
    const pick = pending[randomInt(pending.length)]!;
    const now = new Date().toISOString();

    const { data: updated, error: upErr } = await admin
      .from("matchplay_pair_teams")
      .update({
        auction_order: nextOrder,
        auction_order_at: now,
        auction_order_by: params.userId,
        updated_at: now,
      })
      .eq("id", pick.id)
      .eq("tournament_id", tournamentId)
      .is("auction_order", null)
      .select("id")
      .maybeSingle();

    if (upErr) {
      if (upErr.code === "23505") continue;
      return { ok: false, error: upErr.message, code: "error" };
    }

    if (!updated?.id) continue;

    return {
      ok: true,
      teamId: String(updated.id),
      auctionOrder: nextOrder,
      totalActive,
      pendingAfter: pending.length - 1,
    };
  }

  return {
    ok: false,
    error: "Otro giro estaba en curso. Intenta de nuevo.",
    code: "busy",
  };
}
