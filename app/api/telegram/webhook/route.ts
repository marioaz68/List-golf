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
      const fromId = String(message.from?.id ?? "");

      let replyText = "No pude procesar tu mensaje.";

      if (!supabase) {
        replyText = "Error de configuración del servidor.";
      } else if (!fromId) {
        replyText = "No llegó el identificador de Telegram.";
      } else {
        const { data: player, error } = await supabase
          .from("players")
          .select("id, first_name, last_name, telegram_user_id, telegram_chat_id")
          .eq("telegram_user_id", fromId)
          .maybeSingle();

        if (error) {
          console.error("TELEGRAM PLAYER LOOKUP ERROR:", error);
          replyText = "Ocurrió un error buscando tu jugador.";
        } else if (!player) {
          replyText =
            "Tu cuenta de Telegram no está vinculada a ningún jugador.";
        } else {
          const playerName = [player.first_name, player.last_name]
            .filter(Boolean)
            .join(" ")
            .trim();

          replyText = `Hola ${playerName || "jugador"}, ya te identifiqué correctamente.`;
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