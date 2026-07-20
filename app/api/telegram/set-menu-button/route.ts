/**
 * GET /api/telegram/set-menu-button?secret=...&text=📊
 *
 * Fija el botón de menú (chat menu button) del bot para TODOS los usuarios,
 * como una Mini App con el texto indicado (por defecto 📊). Más confiable que
 * BotFather para dejar el botón compacto.
 *
 * Protegido con BOOTSTRAP_ADMIN_SECRET.
 */
import { NextResponse } from "next/server";
import { telegramAppUrl } from "@/lib/telegram/appUrl";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret") ?? "";
  const admin = process.env.BOOTSTRAP_ADMIN_SECRET?.trim();
  if (!admin || secret !== admin) {
    return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 401 });
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return NextResponse.json({ ok: false, error: "Falta TELEGRAM_BOT_TOKEN" }, { status: 500 });

  const text = url.searchParams.get("text") || "📊";
  const body = {
    menu_button: {
      type: "web_app",
      text,
      web_app: { url: `${telegramAppUrl()}/mini/estadisticas` },
    },
  };

  const res = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, text, telegram: j });
}
