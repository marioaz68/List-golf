import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("TELEGRAM WEBHOOK UPDATE:", JSON.stringify(body, null, 2));

    const message = body.message;

    if (message) {
      const chatId = String(message.chat?.id ?? "");
      const text = String(message.text ?? "");
      const fromId = String(message.from?.id ?? "");
      const username = message.from?.username ?? "";
      const firstName = message.from?.first_name ?? "";
      const lastName = message.from?.last_name ?? "";
      const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

      let replyText =
        `Mensaje recibido.\n\n` +
        `Texto: ${text || "(sin texto)"}\n` +
        `chat_id: ${chatId || "(vacío)"}\n` +
        `from_id: ${fromId || "(vacío)"}\n` +
        `username: ${username || "(sin username)"}\n` +
        `nombre: ${fullName || "(sin nombre)"}`;

      if (!supabase) {
        replyText += `\n\nError: faltan variables de Supabase en el servidor.`;
      } else if (!fromId) {
        replyText += `\n\nNo llegó from_id desde Telegram.`;
      } else {
        const { data: player, error } = await supabase
          .from("players")
          .select("id, first_name, last_name, telegram_user_id, telegram_chat_id")
          .eq("telegram_user_id", fromId)
          .maybeSingle();

        if (error) {
          console.error("TELEGRAM PLAYER LOOKUP ERROR:", error);
          replyText += `\n\nError buscando jugador en players.`;
        } else if (!player) {
          replyText += `\n\nNo encontré jugador vinculado con telegram_user_id ${fromId}.`;
        } else {
          const playerName = [player.first_name, player.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();

          replyText +=
            `\n\nJugador encontrado:` +
            `\nID: ${player.id}` +
            `\nNombre: ${playerName || "(sin nombre)"}` +
            `\ntelegram_user_id: ${player.telegram_user_id || "(vacío)"}` +
            `\ntelegram_chat_id: ${player.telegram_chat_id || "(vacío)"}`;
        }
      }

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: replyText,
        }),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("TELEGRAM WEBHOOK ERROR:", error);

    return NextResponse.json(
      { ok: false, error: "Invalid request" },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "telegram webhook",
  });
}