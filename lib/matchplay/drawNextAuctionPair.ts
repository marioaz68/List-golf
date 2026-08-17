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

export type ReleaseAuctionPairResult =
  | {
      ok: true;
      teamId: string;
      freedOrder: number;
    }
  | { ok: false; error: string; code: "missing" | "error" };

/**
 * Libera el turno de una pareja ya sorteada para volver a rifar ESE mismo
 * número de turno. La pareja sigue activa y vuelve al pool; no se borra.
 */
export async function releaseAuctionPairForRedraw(
  admin: SupabaseClient,
  params: { tournamentId: string; teamId: string }
): Promise<ReleaseAuctionPairResult> {
  const tournamentId = params.tournamentId.trim();
  const teamId = params.teamId.trim();
  if (!tournamentId || !teamId) {
    return { ok: false, error: "Faltan datos.", code: "error" };
  }

  const { data: row, error } = await admin
    .from("matchplay_pair_teams")
    .select("id, auction_order, is_active")
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, code: "error" };
  if (!row?.id || !row.is_active) {
    return { ok: false, error: "Pareja no encontrada.", code: "missing" };
  }
  if (typeof row.auction_order !== "number") {
    return {
      ok: false,
      error: "Esa pareja aún no tiene turno de subasta.",
      code: "missing",
    };
  }

  const freedOrder = row.auction_order;
  const now = new Date().toISOString();
  const { error: upErr } = await admin
    .from("matchplay_pair_teams")
    .update({
      auction_order: null,
      auction_order_at: null,
      auction_order_by: null,
      auction_bid: null,
      updated_at: now,
    })
    .eq("id", teamId)
    .eq("tournament_id", tournamentId)
    .eq("auction_order", freedOrder);

  if (upErr) return { ok: false, error: upErr.message, code: "error" };

  return { ok: true, teamId, freedOrder };
}

/**
 * Sortea UNA pareja pendiente y persiste auction_order (+ auditoría)
 * ANTES de devolver. El azar vive aquí, no en el cliente.
 *
 * preferredOrder: reutiliza un turno liberado (ej. volver a rifar el #3).
 */
export async function drawNextAuctionPair(
  admin: SupabaseClient,
  params: {
    tournamentId: string;
    userId: string | null;
    preferredOrder?: number | null;
  }
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

    const used = new Set(
      list
        .map((t) => t.auction_order)
        .filter((n): n is number => typeof n === "number")
    );
    const maxOrder = list.reduce((m, t) => {
      const n = typeof t.auction_order === "number" ? t.auction_order : 0;
      return n > m ? n : m;
    }, 0);

    const preferred =
      typeof params.preferredOrder === "number" &&
      Number.isFinite(params.preferredOrder) &&
      params.preferredOrder >= 1
        ? Math.floor(params.preferredOrder)
        : null;

    const nextOrder =
      preferred != null && !used.has(preferred) ? preferred : maxOrder + 1;

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
