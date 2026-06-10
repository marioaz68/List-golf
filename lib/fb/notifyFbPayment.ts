import type { SupabaseClient } from "@supabase/supabase-js";
import { formatPrice } from "./types";
import { sendTelegramMessage } from "@/lib/telegram/sendMessage";
import { appBaseUrl } from "@/lib/stripe/server";

async function resolveClientChatId(
  admin: SupabaseClient,
  order: {
    entry_id?: string | null;
    caddie_id?: string | null;
    player_id?: string | null;
  }
): Promise<string | null> {
  if (order.player_id) {
    const { data } = await admin
      .from("players")
      .select("telegram_chat_id, telegram_user_id")
      .eq("id", order.player_id)
      .maybeSingle();
    const p = data as { telegram_chat_id?: string; telegram_user_id?: string } | null;
    return (p?.telegram_chat_id ?? p?.telegram_user_id ?? "").trim() || null;
  }
  if (order.entry_id) {
    const { data } = await admin
      .from("tournament_entries")
      .select("players ( telegram_chat_id, telegram_user_id )")
      .eq("id", order.entry_id)
      .maybeSingle();
    const pl = (data as { players?: unknown } | null)?.players;
    const player = Array.isArray(pl) ? pl[0] : pl;
    if (player) {
      const p = player as { telegram_chat_id?: string; telegram_user_id?: string };
      return (p.telegram_chat_id ?? p.telegram_user_id ?? "").trim() || null;
    }
  }
  if (order.caddie_id) {
    const { data } = await admin
      .from("caddies")
      .select("telegram_chat_id, telegram_user_id")
      .eq("id", order.caddie_id)
      .maybeSingle();
    const c = data as { telegram_chat_id?: string; telegram_user_id?: string } | null;
    return (c?.telegram_chat_id ?? c?.telegram_user_id ?? "").trim() || null;
  }
  return null;
}

/** Avisa al cliente que su pago con tarjeta quedó registrado. */
export async function notifyClientPaymentReceived(
  admin: SupabaseClient,
  order: {
    id: string;
    total_cents: number;
    client_label?: string | null;
    entry_id?: string | null;
    caddie_id?: string | null;
    player_id?: string | null;
  }
): Promise<void> {
  const chatId = await resolveClientChatId(admin, order);
  if (!chatId) return;

  const name = order.client_label?.trim() || "Cliente";
  await sendTelegramMessage({
    chatId,
    text: [
      `✅ Pago recibido · ${formatPrice(order.total_cents)}`,
      "",
      `Gracias ${name}. Tu pedido ya está pagado con tarjeta.`,
      "Puedes ver el detalle en el menú del club.",
    ].join("\n"),
    buttons: [
      [
        {
          text: "🧾 Ver mi ticket",
          url: `${appBaseUrl()}/captura/menu`,
        },
      ],
    ],
  });
}

/** Avisa a cocina/staff que entró un pago (si está configurado el chat). */
export async function notifyStaffPaymentReceived(order: {
  id: string;
  total_cents: number;
  client_label?: string | null;
  status: string;
}): Promise<void> {
  const staffChat =
    process.env.FB_STAFF_TELEGRAM_CHAT_ID?.trim() ||
    process.env.TELEGRAM_COMMITTEE_CHAT_ID?.trim();
  if (!staffChat) return;

  const client = order.client_label?.trim() || "Cliente";
  const isPrepay = order.status === "pending";

  await sendTelegramMessage({
    chatId: staffChat,
    text: [
      isPrepay ? "💳 Pedido prepagado · nuevo en cocina" : "💳 Cuenta cerrada con tarjeta",
      "",
      `Cliente: ${client}`,
      `Total: ${formatPrice(order.total_cents)}`,
      `Pedido: ${order.id.slice(0, 8)}…`,
    ].join("\n"),
  });
}
