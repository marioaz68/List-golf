import { NextResponse } from "next/server";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    console.log("TELEGRAM WEBHOOK UPDATE:", JSON.stringify(body, null, 2));

    const message = body.message;

    if (message) {
      const chatId = message.chat.id;
      const text = message.text;

      // respuesta simple
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: `Recibí tu mensaje: ${text}`,
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