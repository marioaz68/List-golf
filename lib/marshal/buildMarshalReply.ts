import type { SupabaseClient } from "@supabase/supabase-js";
import { buildMarshalMiniAppUrl } from "@/lib/marshal/marshalMiniAppUrl";
import { resolveMarshal } from "@/lib/marshal/resolveMarshal";
import type { TelegramInlineButton } from "@/lib/telegram/sendMessage";

export function isMarshalCommand(command: string): boolean {
  return /^MARSHAL$/i.test(String(command ?? "").trim());
}

export async function buildMarshalReply(
  admin: SupabaseClient,
  telegramUserId: string
): Promise<{ text: string; buttons?: TelegramInlineButton[][] }> {
  const marshal = await resolveMarshal(admin, telegramUserId);
  if (!marshal) {
    return {
      text: [
        "No estás vinculado como Marshal.",
        "",
        "1. Pide al comité que te dé de alta con rol Marshal.",
        "2. Envía: /soy_marshal tu_email@dominio.com",
        "3. Vuelve a escribir /MARSHAL",
      ].join("\n"),
    };
  }

  const url = buildMarshalMiniAppUrl({ telegramChatId: telegramUserId });
  return {
    text: [
      `Hola ${marshal.name} 👋`,
      "",
      "Panel marshal: capturas retrasadas del día y resultados en vivo.",
      "",
      "Toca el botón para abrir la mini app.",
    ].join("\n"),
    buttons: [[{ text: "📋 Capturas y resultados", url }]],
  };
}
