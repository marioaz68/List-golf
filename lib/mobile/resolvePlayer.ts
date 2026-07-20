import type { SupabaseClient } from "@supabase/supabase-js";
import { validateTelegramInitData } from "@/lib/telegram/validateInitData";

/**
 * Valida el initData de Telegram y devuelve el player_id del jugador vinculado.
 * Reutilizable por las rutas de la Mini App (estadísticas, exclusiones, etc.).
 */
export async function resolvePlayerId(
  admin: SupabaseClient,
  initData: string
): Promise<{ ok: true; playerId: string } | { ok: false; status: number; error: string }> {
  const check = validateTelegramInitData(initData);
  if (!check.ok || !check.user) {
    return { ok: false, status: 401, error: check.error ?? "No autorizado" };
  }
  const { data: player, error } = await admin
    .from("players")
    .select("id")
    .eq("telegram_user_id", String(check.user.id))
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Error identificando jugador" };
  if (!player?.id) {
    return { ok: false, status: 404, error: "Tu cuenta de Telegram no está vinculada a un jugador." };
  }
  return { ok: true, playerId: player.id as string };
}
