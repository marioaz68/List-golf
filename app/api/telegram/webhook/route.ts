import { NextResponse } from "next/server";

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

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

      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: chatId,
          text:
            `Mensaje recibido.\n\n` +
            `Texto: ${text || "(sin texto)"}\n` +
            `chat_id: ${chatId || "(vacío)"}\n` +
            `from_id: ${fromId || "(vacío)"}\n` +
            `username: ${username || "(sin username)"}\n` +
            `nombre: ${fullName || "(sin nombre)"}`,
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