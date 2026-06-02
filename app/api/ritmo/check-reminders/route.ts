/**
 * Endpoint disparado por Vercel Cron cada 5 minutos.
 * Revisa grupos del día y manda recordatorios de Live Location.
 *
 * Protección: Vercel manda header `Authorization: Bearer <CRON_SECRET>` cuando
 * el route está configurado en vercel.json. Validamos contra process.env.CRON_SECRET.
 */

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runRitmoReminders } from "@/lib/telegram/ritmo/reminders";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CRON_SECRET = process.env.CRON_SECRET?.trim();

const supabase =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    : null;

export async function GET(req: Request) {
  // Validación de auth: Vercel Cron incluye Authorization: Bearer <secret>
  const authHeader = req.headers.get("authorization") ?? "";
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") ?? "";

  if (CRON_SECRET) {
    const headerOk = authHeader === `Bearer ${CRON_SECRET}`;
    const querySecretOk = querySecret === CRON_SECRET;
    if (!headerOk && !querySecretOk) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured" },
      { status: 500 }
    );
  }

  try {
    const result = await runRitmoReminders(supabase);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("RITMO REMINDERS ERROR:", err);
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
